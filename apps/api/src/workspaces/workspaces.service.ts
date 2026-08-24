import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EstimateMode } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CreateWorkspaceDto } from './dto/create-workspace.dto';
import type { UpdateWorkspaceDto } from './dto/update-workspace.dto';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const DEFAULT_COLUMNS = [
  {
    name: 'Backlog',
    color: '#64748B',
    position: 0,
    isBacklog: true,
    isTodo: false,
    isReview: false,
    isDone: false,
  },
  {
    name: 'To Do',
    color: '#2563EB',
    position: 1,
    isBacklog: false,
    isTodo: true,
    isReview: false,
    isDone: false,
  },
  {
    name: 'In progress',
    color: '#F59E0B',
    position: 2,
    isBacklog: false,
    isTodo: false,
    isReview: false,
    isDone: false,
  },
  {
    name: 'Review',
    color: '#8B5CF6',
    position: 3,
    isBacklog: false,
    isTodo: false,
    isReview: true,
    isDone: false,
  },
  {
    name: 'Done',
    color: '#059669',
    position: 4,
    isBacklog: false,
    isTodo: false,
    isReview: false,
    isDone: true,
  },
];

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const count = await this.prisma.workspace.count();
    if (count === 0) {
      await this.prisma.workspace.upsert({
        where: { id: DEFAULT_WORKSPACE_ID },
        update: {},
        create: {
          id: DEFAULT_WORKSPACE_ID,
          name: 'Main Workspace',
          description: 'Default team workspace',
          columns: {
            create: DEFAULT_COLUMNS,
          },
        },
      });
    }
    return this.prisma.workspace.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { tasks: true, sprints: true, columns: true },
        },
      },
    });
  }

  async get(id: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id },
      include: {
        columns: { orderBy: { position: 'asc' } },
        _count: {
          select: { tasks: true, sprints: true, columns: true },
        },
      },
    });
    if (!workspace) throw new NotFoundException('Workspace not found.');
    return workspace;
  }

  async create(input: CreateWorkspaceDto, actorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Workspace name cannot be empty.');

    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.create({
        data: {
          name,
          description: input.description?.trim() || null,
          estimateMode: input.estimateMode ?? EstimateMode.TIME,
          sprintDurationDays: input.sprintDurationDays ?? 14,
        },
      });

      for (const col of DEFAULT_COLUMNS) {
        await transaction.boardColumn.create({
          data: {
            workspaceId: workspace.id,
            name: col.name,
            color: col.color,
            position: col.position,
            isBacklog: col.isBacklog,
            isTodo: col.isTodo,
            isReview: col.isReview,
            isDone: col.isDone,
          },
        });
      }

      await transaction.activityEvent.create({
        data: {
          eventType: 'workspace.created',
          entityType: 'workspace',
          entityId: workspace.id,
          actorId,
          payload: {
            version: 1,
            name: workspace.name,
            estimateMode: workspace.estimateMode,
            sprintDurationDays: workspace.sprintDurationDays,
          },
        },
      });

      return transaction.workspace.findUniqueOrThrow({
        where: { id: workspace.id },
        include: {
          columns: { orderBy: { position: 'asc' } },
          _count: {
            select: { tasks: true, sprints: true, columns: true },
          },
        },
      });
    });
  }

  async update(id: string, input: UpdateWorkspaceDto, actorId: string) {
    const existing = await this.prisma.workspace.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Workspace not found.');

    if (input.name !== undefined && !input.name.trim()) {
      throw new BadRequestException('Workspace name cannot be empty.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const workspace = await transaction.workspace.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.description !== undefined
            ? { description: input.description.trim() || null }
            : {}),
          ...(input.estimateMode !== undefined ? { estimateMode: input.estimateMode } : {}),
          ...(input.sprintDurationDays !== undefined
            ? { sprintDurationDays: input.sprintDurationDays }
            : {}),
        },
        include: {
          columns: { orderBy: { position: 'asc' } },
          _count: {
            select: { tasks: true, sprints: true, columns: true },
          },
        },
      });

      await transaction.activityEvent.create({
        data: {
          eventType: 'workspace.updated',
          entityType: 'workspace',
          entityId: id,
          actorId,
          payload: {
            version: 1,
            fields: Object.keys(input),
          },
        },
      });

      return workspace;
    });
  }

  async remove(id: string, actorId: string) {
    const count = await this.prisma.workspace.count();
    if (count <= 1) {
      throw new BadRequestException('Cannot delete the last remaining workspace.');
    }

    const existing = await this.prisma.workspace.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Workspace not found.');

    return this.prisma.$transaction(async (transaction) => {
      await transaction.workspace.delete({ where: { id } });

      await transaction.activityEvent.create({
        data: {
          eventType: 'workspace.deleted',
          entityType: 'workspace',
          entityId: id,
          actorId,
          payload: {
            version: 1,
            name: existing.name,
          },
        },
      });
    });
  }

  async resolveWorkspaceId(workspaceId?: string): Promise<string> {
    if (workspaceId) {
      const exists = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (exists) return exists.id;
    }

    const first = await this.prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) return first.id;

    // In case no workspace exists, seed the default one
    const defaultWorkspace = await this.prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      update: {},
      create: {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Main Workspace',
        description: 'Default team workspace',
        estimateMode: EstimateMode.TIME,
        sprintDurationDays: 14,
      },
    });

    return defaultWorkspace.id;
  }
}
