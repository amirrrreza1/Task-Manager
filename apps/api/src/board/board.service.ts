import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import type { BoardQueryDto } from './dto/board-query.dto';
import type { CreateColumnDto } from './dto/create-column.dto';
import type { ReorderColumnsDto } from './dto/reorder-columns.dto';
import type { UpdateColumnDto } from './dto/update-column.dto';

const taskCardInclude = {
  assignees: {
    orderBy: { assignedAt: 'asc' },
    include: {
      user: { select: { id: true, displayName: true, avatarSeed: true, isActive: true } },
    },
  },
  subtasks: { select: { id: true, isCompleted: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TaskInclude;

@Injectable()
export class BoardService {
  constructor(private readonly prisma: PrismaService) {}

  listColumns() {
    return this.prisma.boardColumn.findMany({ orderBy: { position: 'asc' } });
  }

  async read(query: BoardQueryDto) {
    const where: Prisma.TaskWhereInput = {
      ...(query.search?.trim()
        ? {
            OR: [
              { title: { contains: query.search.trim(), mode: 'insensitive' } },
              { description: { contains: query.search.trim(), mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(query.assigneeId ? { assignees: { some: { userId: query.assigneeId } } } : {}),
      ...(query.sprintId ? { sprintId: query.sprintId } : {}),
      ...(query.unassigned ? { assignees: { none: {} } } : {}),
      ...(query.hasEstimate === true ? { estimateValue: { not: null } } : {}),
      ...(query.hasEstimate === false ? { estimateValue: null } : {}),
    };
    const [columns, settings] = await this.prisma.$transaction([
      this.prisma.boardColumn.findMany({
        orderBy: { position: 'asc' },
        include: { tasks: { where, orderBy: { position: 'asc' }, include: taskCardInclude } },
      }),
      this.prisma.appSettings.findUniqueOrThrow({ where: { id: 'default' } }),
    ]);
    return { columns, settings };
  }

  async create(input: CreateColumnDto, actor: AuthenticatedUser) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Column name cannot be empty.');
    return this.prisma.$transaction(async (transaction) => {
      const last = await transaction.boardColumn.aggregate({ _max: { position: true } });
      if (input.isDone) {
        await transaction.boardColumn.updateMany({
          where: { isDone: true },
          data: { isDone: false },
        });
      }
      const column = await transaction.boardColumn.create({
        data: {
          name,
          color: input.color.toUpperCase(),
          position: (last._max.position ?? -1) + 1,
          isDone: input.isDone ?? false,
        },
      });
      await this.event(transaction, 'board_column.created', column.id, actor.id, { name });
      return column;
    });
  }

  async update(id: string, input: UpdateColumnDto, actor: AuthenticatedUser) {
    const existing = await this.prisma.boardColumn.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Board column not found.');
    if (input.name !== undefined && !input.name.trim())
      throw new BadRequestException('Column name cannot be empty.');
    if (existing.isDone && input.isDone === false) {
      throw new BadRequestException(
        'Choose another done column instead of removing the only done designation.',
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      if (input.isDone === true) {
        await transaction.boardColumn.updateMany({
          where: { isDone: true, id: { not: id } },
          data: { isDone: false },
        });
      }
      const column = await transaction.boardColumn.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.color !== undefined ? { color: input.color.toUpperCase() } : {}),
          ...(input.isDone !== undefined ? { isDone: input.isDone } : {}),
        },
      });
      await this.event(transaction, 'board_column.updated', id, actor.id, {
        fields: Object.keys(input),
      });
      return column;
    });
  }

  async reorder(input: ReorderColumnsDto, actor: AuthenticatedUser) {
    if (new Set(input.columnIds).size !== input.columnIds.length)
      throw new BadRequestException('Column IDs must be unique.');
    return this.prisma.$transaction(async (transaction) => {
      const columns = await transaction.boardColumn.findMany({ select: { id: true } });
      if (
        columns.length !== input.columnIds.length ||
        columns.some((column) => !input.columnIds.includes(column.id))
      ) {
        throw new BadRequestException('The order must contain every board column exactly once.');
      }
      await transaction.boardColumn.updateMany({ data: { position: { increment: 10_000 } } });
      for (const [position, id] of input.columnIds.entries()) {
        await transaction.boardColumn.update({ where: { id }, data: { position } });
      }
      await this.event(transaction, 'board_column.reordered', input.columnIds[0], actor.id, {
        columnIds: input.columnIds,
      });
      return transaction.boardColumn.findMany({ orderBy: { position: 'asc' } });
    });
  }

  async remove(id: string, moveTasksTo: string | undefined, actor: AuthenticatedUser) {
    return this.prisma.$transaction(async (transaction) => {
      const columns = await transaction.boardColumn.findMany({ orderBy: { position: 'asc' } });
      const column = columns.find((candidate) => candidate.id === id);
      if (!column) throw new NotFoundException('Board column not found.');
      if (columns.length <= 2)
        throw new BadRequestException('At least two board columns must remain.');
      if (column.isDone)
        throw new BadRequestException('Designate another done column before deleting this one.');
      const taskCount = await transaction.task.count({ where: { columnId: id } });
      if (taskCount > 0) {
        if (!moveTasksTo || moveTasksTo === id)
          throw new ConflictException('Choose a destination for tasks in this column.');
        const destination = columns.find((candidate) => candidate.id === moveTasksTo);
        if (!destination) throw new BadRequestException('Destination column not found.');
        const maximum = await transaction.task.aggregate({
          where: { columnId: moveTasksTo },
          _max: { position: true },
        });
        const moving = await transaction.task.findMany({
          where: { columnId: id },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        let position = Number(maximum._max.position ?? 0);
        for (const task of moving) {
          position += 1024;
          await transaction.task.update({
            where: { id: task.id },
            data: { columnId: moveTasksTo, position },
          });
        }
      }
      await transaction.boardColumn.delete({ where: { id } });
      const remaining = columns.filter((candidate) => candidate.id !== id);
      await transaction.boardColumn.updateMany({ data: { position: { increment: 10_000 } } });
      for (const [position, item] of remaining.entries())
        await transaction.boardColumn.update({ where: { id: item.id }, data: { position } });
      await this.event(transaction, 'board_column.deleted', id, actor.id, {
        movedTaskCount: taskCount,
        destinationColumnId: moveTasksTo ?? null,
      });
    });
  }

  private event(
    transaction: Prisma.TransactionClient,
    eventType: string,
    entityId: string,
    actorId: string,
    details: object,
  ) {
    return transaction.activityEvent.create({
      data: {
        eventType,
        entityType: 'board_column',
        entityId,
        actorId,
        payload: { version: 1, ...details },
      },
    });
  }
}
