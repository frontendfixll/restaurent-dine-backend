import { Request, Response } from 'express';
import { asyncHandler } from '@utils/asyncHandler';
import { ok } from '@utils/apiResponse';
import { AppError } from '@utils/AppError';
import * as svc from './reports.service';
import { reportToCsv, reportToXlsx, reportToPdf } from './reports.exporters';

export const sales = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.salesReport(req.query as svc.SalesReportOpts));
});

export const items = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.itemsReport(req.query as svc.ItemsReportOpts));
});

export const tax = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.taxReport(req.query as { from?: Date; to?: Date }));
});

export const payments = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.paymentsReport(req.query as { from?: Date; to?: Date }));
});

export const staff = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.staffReport(req.query as { from?: Date; to?: Date }));
});

export const footfall = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.footfallReport(req.query as { from?: Date; to?: Date }));
});

export const inventory = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.inventoryReport(req.query as { from?: Date; to?: Date }));
});

export const feedback = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.feedbackReport(req.query as { from?: Date; to?: Date }));
});

export const profitability = asyncHandler(async (req: Request, res: Response) => {
  return ok(res, await svc.profitabilityReport(req.query as { from?: Date; to?: Date }));
});

export const kpi = asyncHandler(async (_req: Request, res: Response) => {
  return ok(res, await svc.kpiDashboard());
});

async function runReport(type: string, query: Record<string, unknown>) {
  switch (type) {
    case 'sales':
      return svc.salesReport(query as svc.SalesReportOpts);
    case 'items':
      return svc.itemsReport(query as svc.ItemsReportOpts);
    case 'tax':
      return svc.taxReport(query as { from?: Date; to?: Date });
    case 'payments':
      return svc.paymentsReport(query as { from?: Date; to?: Date });
    case 'staff':
      return svc.staffReport(query as { from?: Date; to?: Date });
    case 'footfall':
      return svc.footfallReport(query as { from?: Date; to?: Date });
    case 'inventory':
      return svc.inventoryReport(query as { from?: Date; to?: Date });
    case 'feedback':
      return svc.feedbackReport(query as { from?: Date; to?: Date });
    case 'profitability':
      return svc.profitabilityReport(query as { from?: Date; to?: Date });
    default:
      throw AppError.badRequest(`Unknown report type "${type}"`);
  }
}

export const exportReport = asyncHandler(async (req: Request, res: Response) => {
  const { type } = req.params as { type: string };
  const { format = 'csv', ...rest } = req.query as { format?: 'csv' | 'xlsx' | 'pdf' } & Record<string, unknown>;
  const report = (await runReport(type, rest)) as unknown as Record<string, unknown>;
  const filename = `${type}-report-${Date.now()}`;

  if (format === 'csv') {
    const buf = reportToCsv(report);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(buf);
  }
  if (format === 'xlsx') {
    const buf = reportToXlsx(report);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    return res.send(buf);
  }
  const buf = await reportToPdf(`${type[0].toUpperCase() + type.slice(1)} Report`, report);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}.pdf"`);
  return res.send(buf);
});
