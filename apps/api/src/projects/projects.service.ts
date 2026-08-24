import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import type { CreateProjectDto } from './dto/create-project.dto';
import type { ProjectQueryDto } from './dto/project-query.dto';
import type { UpdateProjectDto } from './dto/update-project.dto';

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

const userSummary = {
  id: true,
  displayName: true,
  color: true,
  hasAvatar: true,
  isActive: true,
} satisfies Prisma.UserSelect;

const projectInclude = {
  _count: { select: { tasks: true } },
  seniors: {
    orderBy: { assignedAt: 'asc' },
    include: {
      user: { select: userSummary },
    },
  },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async resolveWorkspaceId(workspaceId?: string): Promise<string> {
    if (workspaceId) {
      const exists = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
      if (exists) return exists.id;
    }
    const first = await this.prisma.workspace.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) return first.id;
    const defaultWs = await this.prisma.workspace.upsert({
      where: { id: DEFAULT_WORKSPACE_ID },
      update: {},
      create: {
        id: DEFAULT_WORKSPACE_ID,
        name: 'Main Workspace',
        description: 'Default team workspace',
      },
    });
    return defaultWs.id;
  }

  private async assertActiveUsers(ids: string[]) {
    if (!ids.length) return;
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException('Senior IDs must be unique.');
    }
    const count = await this.prisma.user.count({ where: { id: { in: ids }, isActive: true } });
    if (count !== ids.length) {
      throw new BadRequestException('Every senior must be an active user.');
    }
  }

  private async event(
    transaction: Prisma.TransactionClient,
    eventType: string,
    entityId: string,
    actorId: string,
    payload: Record<string, unknown>,
  ) {
    await transaction.activityEvent.create({
      data: {
        eventType,
        entityType: 'project',
        entityId,
        actorId,
        payload: { version: 1, ...payload },
      },
    });
  }

  async list(query: ProjectQueryDto) {
    const workspaceId = await this.resolveWorkspaceId(query.workspaceId);
    return this.prisma.project.findMany({
      where: { workspaceId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: projectInclude,
    });
  }

  async get(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: projectInclude,
    });
    if (!project) throw new NotFoundException('Project not found.');
    return project;
  }

  async create(input: CreateProjectDto, actorId: string) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException('Project name cannot be empty.');
    const workspaceId = await this.resolveWorkspaceId(input.workspaceId);
    const key = input.key?.trim().toUpperCase() || null;
    const description = input.description?.trim() || null;
    const color = input.color?.trim() || '#2563EB';
    const icon = input.icon?.trim() || 'Folder';

    if (input.seniorUserIds && input.seniorUserIds.length > 0) {
      await this.assertActiveUsers(input.seniorUserIds);
    }

    const existing = await this.prisma.project.findFirst({
      where: { workspaceId, name },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('A project with this name already exists in this workspace.');
    }

    return this.prisma.$transaction(async (transaction) => {
      const project = await transaction.project.create({
        data: {
          workspaceId,
          name,
          key,
          description,
          color,
          icon,
          ...(input.seniorUserIds && input.seniorUserIds.length > 0
            ? {
                seniors: {
                  create: input.seniorUserIds.map((userId) => ({ userId })),
                },
              }
            : {}),
        },
        include: projectInclude,
      });

      await this.event(transaction, 'project.created', project.id, actorId, {
        name,
        key,
        workspaceId,
        seniorUserIds: input.seniorUserIds ?? [],
      });

      return project;
    });
  }

  async update(id: string, input: UpdateProjectDto, actorId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found.');

    const name = input.name !== undefined ? input.name.trim() : undefined;
    if (name !== undefined && !name) {
      throw new BadRequestException('Project name cannot be empty.');
    }

    if (name && name !== project.name) {
      const existing = await this.prisma.project.findFirst({
        where: { workspaceId: project.workspaceId, name },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException('A project with this name already exists in this workspace.');
      }
    }

    if (input.seniorUserIds !== undefined) {
      await this.assertActiveUsers(input.seniorUserIds);
    }

    const key = input.key !== undefined ? input.key?.trim().toUpperCase() || null : undefined;
    const description =
      input.description !== undefined ? input.description?.trim() || null : undefined;
    const color = input.color !== undefined ? input.color?.trim() || '#2563EB' : undefined;
    const icon = input.icon !== undefined ? input.icon?.trim() || 'Folder' : undefined;

    return this.prisma.$transaction(async (transaction) => {
      if (input.seniorUserIds !== undefined) {
        await transaction.projectSenior.deleteMany({ where: { projectId: id } });
        if (input.seniorUserIds.length > 0) {
          await transaction.projectSenior.createMany({
            data: input.seniorUserIds.map((userId) => ({ projectId: id, userId })),
          });
        }
      }

      const updated = await transaction.project.update({
        where: { id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(key !== undefined ? { key } : {}),
          ...(description !== undefined ? { description } : {}),
          ...(color !== undefined ? { color } : {}),
          ...(icon !== undefined ? { icon } : {}),
        },
        include: projectInclude,
      });

      await this.event(transaction, 'project.updated', id, actorId, {
        fields: Object.keys(input),
      });

      return updated;
    });
  }

  async remove(id: string, actorId: string) {
    const project = await this.prisma.project.findUnique({ where: { id } });
    if (!project) throw new NotFoundException('Project not found.');

    return this.prisma.$transaction(async (transaction) => {
      await transaction.project.delete({ where: { id } });
      await this.event(transaction, 'project.deleted', id, actorId, {
        name: project.name,
        workspaceId: project.workspaceId,
      });
      return { id };
    });
  }
}
