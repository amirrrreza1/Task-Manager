import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityQueryDto } from './dto/activity-query.dto';
import { MemberReportQueryDto } from './dto/member-report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@Controller('reports')
@Roles(UserRole.ADMIN)
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('activity')
  @ApiOperation({ summary: 'Paginated activity log (admin only)' })
  activityLog(@Query() query: ActivityQueryDto) {
    return this.reports.activityLog(query);
  }

  @Get('members/:userId')
  @ApiOperation({ summary: 'Subtask completion and estimate report for one member (admin only)' })
  memberReport(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Query() query: MemberReportQueryDto,
  ) {
    return this.reports.memberReport(userId, query);
  }

  @Get('sprints/:sprintId')
  @ApiOperation({ summary: 'Sprint breakdown report: tasks, subtasks, who did what (admin only)' })
  sprintReport(@Param('sprintId', ParseUUIDPipe) sprintId: string) {
    return this.reports.sprintReport(sprintId);
  }
}
