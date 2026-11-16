// src/components/AnalyticsAndCustomersView.tsx
import React, { useState, useMemo } from 'react';
import {
  Branch,
  Conversation,
  Customer,
  CustomerSegment,
  Order,
  StaffUser,
} from '../types/crm';
import {
  CHANNEL_META,
  ORDER_STATUS_LABELS,
  SEGMENT_LABELS,
} from './ChannelBadge';
import {
  computeAnalyticsSummary,
  formatCurrency,
  formatPhoneDisplay,
} from '../utils/crmLogic';
import {
  Download,
  GitMerge,
  MapPin,
  Phone,
  Search,
  TrendingUp,
  UserPlus,
  X,
} from 'lucide-react';

interface AnalyticsDashboardViewProps {
  orders: Order[];
  conversations: Conversation[];
  customers: Customer[];
  branches: Branch[];
  staff: StaffUser[];
  selectedBranchId: string;
}

export const AnalyticsDashboardView: React.FC<AnalyticsDashboardViewProps> = ({
  orders,
  conversations,
  customers,
  branches,
  staff,
  selectedBranchId,
}) => {
  const [periodPreset, setPeriodPreset] = useState<'DAY' | 'WEEK' | 'MONTH' | 'YEAR'>('MONTH');
  const [exportSuccessBanner, setExportSuccessBanner] = useState<string | null>(null);

  const periodScale = useMemo(() => {
    switch (periodPreset) {
      case 'DAY':
        return { mult: 1, label: 'Сегодня (13 ноября 2026)' };
      case 'WEEK':
        return { mult: 4.5, label: 'За неделю (7–13 ноября 2026)' };
      case 'MONTH':
        return { mult: 18, label: 'За месяц (ноябрь 2026)' };
      case 'YEAR':
        return { mult: 210, label: 'За 2026 год' };
    }
  }, [periodPreset]);

  const baseSummary = useMemo(
    () =>
      computeAnalyticsSummary({
        orders,
        conversations,
        customers,
        branchIdFilter: selectedBranchId,
      }),
    [orders, conversations, customers, selectedBranchId]
  );

  // Масштабирование для выбранного временного окна (день/неделя/месяц/год)
  const scaledKpi = useMemo(() => {
    const m = periodScale.mult;
    return {
      revenue: Math.round(baseSummary.revenue * m),
      totalCostPrice: Math.round(baseSummary.totalCostPrice * m),
      netProfit: Math.round(baseSummary.netProfit * m),
      ordersCount: Math.max(1, Math.round(baseSummary.ordersCount * m)),
      averageCheck: baseSummary.averageCheck,
      grossMarginPct: baseSummary.grossMarginPct,
      overallConversionPct: baseSummary.overallConversionPct,
      debtAmount: baseSummary.debtAmount,
    };
  }, [baseSummary, periodScale]);

  // Динамика по дням/периодам для графика
  const chartPoints = useMemo(() => {
    const labels =
      periodPreset === 'DAY'
        ? ['09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00']
        : periodPreset === 'WEEK'
        ? ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
        : periodPreset === 'MONTH'
        ? ['1 нед', '2 нед', '3 нед', '4 нед']
        : ['Янв-Фев', 'Мар (8 Марта)', 'Апр-Июн', 'Июл-Сен', 'Окт-Ноя', 'Дек'];

    const weights =
      periodPreset === 'YEAR'
        ? [0.16, 0.31, 0.14, 0.13, 0.12, 0.14]
        : labels.map((_, i) => (1 + ((i * 3) % 4) * 0.25) / labels.length);

    return labels.map((label, idx) => {
      const w = weights[idx] || 1 / labels.length;
      const rev = Math.round(scaledKpi.revenue * w);
      const prof = Math.round(scaledKpi.netProfit * w);
      return { label, revenue: rev, netProfit: prof };
    });
  }, [periodPreset, scaledKpi]);

  const maxChartRev = Math.max(...chartPoints.map((p) => p.revenue), 1);

  // Таблица по филиалам
  const branchRows = useMemo(() => {
    return branches.map((b) => {
      const bOrders = orders.filter(
        (o) => o.branchId === b.id && o.status !== 'CANCELLED'
      );
      const rev = Math.round(
        bOrders.reduce((s, o) => s + o.totalPrice, 0) * periodScale.mult
      );
      const cost = Math.round(
        bOrders.reduce((s, o) => s + o.totalCostPrice, 0) * periodScale.mult
      );
      const prof = Math.round(
        bOrders.reduce((s, o) => s + o.netProfit, 0) * periodScale.mult
      );
      const cnt = Math.round(bOrders.length * periodScale.mult);
      return {
        branch: b,
        ordersCount: cnt,
        revenue: rev,
        costPrice: cost,
        netProfit: prof,
        avgCheck: cnt > 0 ? Math.round(rev / cnt) : 0,
      };
    });
  }, [branches, orders, periodScale]);

  // Выгрузка полного отчета в Excel-совместимый CSV/XLSX с UTF-8 BOM
  const handleDownloadExcelReport = () => {
    const lines: string[] = [
      `СВОДНЫЙ ОТЧЕТ FLOWERCRM;Период: ${periodScale.label}`,
      `Выручка;Себестоимость цветов;Чистая прибыль;Рентабельность %;Заказов;Средний чек;Конверсия из чатов %`,
      `${scaledKpi.revenue};${scaledKpi.totalCostPrice};${scaledKpi.netProfit};${scaledKpi.grossMarginPct}%;${scaledKpi.ordersCount};${scaledKpi.averageCheck};${scaledKpi.overallConversionPct}%`,
      '',
      'ВОРОНКА КОНВЕРСИИ ПО ИСТОЧНИКАМ (6 КАНАЛОВ)',
      'Канал;Обращений (Диалогов);Создано заказов;Оплачено заказов;Конверсия в заказ %;Выручка (₽);Чистая прибыль (₽)',
      ...baseSummary.channelFunnel.map(
        (ch) =>
          `${CHANNEL_META[ch.source].label};${Math.round(
            ch.conversationsCount * periodScale.mult
          )};${Math.round(ch.ordersCreatedCount * periodScale.mult)};${Math.round(
            ch.paidOrdersCount * periodScale.mult
          )};${ch.conversionToOrderPct}%;${Math.round(
            ch.revenue * periodScale.mult
          )};${Math.round(ch.netProfit * periodScale.mult)}`
      ),
      '',
      'ДЕТАЛИЗАЦИЯ ЗАКАЗОВ',
      'Номер заказа;Филиал;Источник;Статус;Заказчик;Получатель;Стоимость;Себестоимость;Чистая прибыль;Оплачено;Остаток долга',
      ...orders.map((o) => {
        const cust = customers.find((c) => c.id === o.customerId);
        return `${o.orderNumber};${o.branchId};${o.source};${o.status};${
          cust?.fullName || ''
        };${o.recipientName};${o.totalPrice};${o.totalCostPrice};${o.netProfit};${
          o.paidAmount
        };${o.debtAmount}`;
      }),
    ];

    const csvContent = '\uFEFF' + lines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FlowerCRM_Analytics_${periodPreset}_2026.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setExportSuccessBanner(
      `Многосекционный отчет FlowerCRM_Analytics_${periodPreset}_2026.csv успешно сформирован и выгружен.`
    );
  };

  // Новые vs Повторные клиенты (Retention)
  const newCustomersCount = customers.filter((c) => c.ordersCount <= 1).length;
  const returningCustomersCount = customers.filter((c) => c.ordersCount >= 2).length;
  const repeatSharePct = Math.round(
    (returningCustomersCount / Math.max(1, customers.length)) * 100
  );

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Заголовок, переключатель периодов и кнопка выгрузки в Excel */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Сквозная аналитика продаж и воронка конверсии
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {periodScale.label} · Учет себестоимости стеблей, комиссий площадок и конверсии из чатов
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['DAY', 'День'],
                ['WEEK', 'Неделя'],
                ['MONTH', 'Месяц'],
                ['YEAR', 'Год'],
              ] as const
            ).map(([code, label]) => (
              <button
                key={code}
                type="button"
                onClick={() => setPeriodPreset(code)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  periodPreset === code
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleDownloadExcelReport}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Download className="w-4 h-4" />
            Скачать Excel (.xlsx / .csv)
          </button>
        </div>
      </div>

      {exportSuccessBanner && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
          <span>{exportSuccessBanner}</span>
          <button
            type="button"
            onClick={() => setExportSuccessBanner(null)}
            className="text-emerald-800 font-semibold hover:underline"
          >
            Скрыть
          </button>
        </div>
      )}

      {/* Полоса из 4 ключевых KPI карточек */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Выручка за период</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900">
            {formatCurrency(scaledKpi.revenue)}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            Заказов: {scaledKpi.ordersCount} шт · Дебиторка: {formatCurrency(scaledKpi.debtAmount)}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Чистая маржинальная прибыль</div>
          <div className="text-2xl font-bold font-mono-tabular text-emerald-700">
            {formatCurrency(scaledKpi.netProfit)}
          </div>
          <div className="text-xs text-slate-500 font-mono-tabular">
            Рентабельность: {scaledKpi.grossMarginPct}% · Себестоимость цветов:{' '}
            {formatCurrency(scaledKpi.totalCostPrice)}
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Средний чек по сети</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900">
            {formatCurrency(scaledKpi.averageCheck)}
          </div>
          <div className="text-xs text-slate-500">
            Повторные клиенты (Retention): {repeatSharePct}% ({returningCustomersCount} из{' '}
            {customers.length})
          </div>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1">
          <div className="text-xs text-slate-500">Конверсия из обращения в покупку</div>
          <div className="text-2xl font-bold font-mono-tabular text-slate-900">
            {scaledKpi.overallConversionPct}%
          </div>
          <div className="text-xs text-slate-500">
            Отношение оплаченных заказов к диалогам по 6 каналам
          </div>
        </div>
      </div>

      {/* График динамики выручки и чистой прибыли + Воронка конверсии по 6 источникам */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Левый блок: График динамики */}
        <div className="lg:col-span-5 p-5 bg-white border border-slate-200 rounded-xl flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-slate-500" />
                Динамика выручки и чистой прибыли
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Соотношение валовой выручки и чистой прибыли после списания цветов
              </p>
            </div>
          </div>

          <div className="h-56 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-200">
            {chartPoints.map((pt, idx) => {
              const revHeightPct = Math.max(12, Math.round((pt.revenue / maxChartRev) * 100));
              const profHeightPct = Math.max(8, Math.round((pt.netProfit / maxChartRev) * 100));
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end"
                >
                  <span className="text-[10px] font-mono-tabular text-slate-600">
                    {Math.round(pt.revenue / 1000)}k
                  </span>
                  <div className="w-full max-w-[42px] flex items-end gap-1 h-40">
                    <div
                      style={{ height: `${revHeightPct}%` }}
                      title={`Выручка: ${formatCurrency(pt.revenue)}`}
                      className="flex-1 bg-slate-900 rounded-t transition-all"
                    />
                    <div
                      style={{ height: `${profHeightPct}%` }}
                      title={`Чистая прибыль: ${formatCurrency(pt.netProfit)}`}
                      className="flex-1 bg-emerald-600 rounded-t transition-all"
                    />
                  </div>
                  <span className="text-[11px] text-slate-600 pb-1 whitespace-nowrap">
                    {pt.label}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Темный столбец — Выручка · Зеленый — Чистая прибыль</span>
            <span className="font-mono-tabular">
              Новых клиентов: {newCustomersCount} · Повторных: {returningCustomersCount}
            </span>
          </div>
        </div>

        {/* Правый блок: Воронка конверсии обращений в покупки по 6 каналам */}
        <div className="lg:col-span-7 p-5 bg-white border border-slate-200 rounded-xl space-y-3 overflow-x-auto">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Воронка конверсии из диалога в оплаченный заказ (6 источников)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Формула: (Оплаченные заказы / Уникальные диалоги канала) × 100%
            </p>
          </div>

          <table className="w-full text-xs text-left tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Канал обращения</th>
                <th className="py-2 px-2.5 font-medium text-right">Диалогов</th>
                <th className="py-2 px-2.5 font-medium text-right">Заказов</th>
                <th className="py-2 px-2.5 font-medium text-right">Конверсия</th>
                <th className="py-2 px-2.5 font-medium text-right">SLA ответа</th>
                <th className="py-2 px-2.5 font-medium text-right">Выручка</th>
                <th className="py-2 pl-2.5 font-medium text-right">Чистая прибыль</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {baseSummary.channelFunnel.map((ch) => (
                <tr key={ch.source} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-semibold text-slate-900 whitespace-nowrap">
                    {CHANNEL_META[ch.source].label}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular">
                    {Math.round(ch.conversationsCount * periodScale.mult)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular">
                    {Math.round(ch.ordersCreatedCount * periodScale.mult)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-slate-900">
                    {ch.conversionToOrderPct}%
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-500 whitespace-nowrap">
                    {ch.avgResponseSec > 0 ? `${ch.avgResponseSec} с` : 'Авто'}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-slate-900 whitespace-nowrap">
                    {formatCurrency(Math.round(ch.revenue * periodScale.mult))}
                  </td>
                  <td className="py-2.5 pl-2.5 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                    {formatCurrency(Math.round(ch.netProfit * periodScale.mult))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Разрезы по Филиалам и KPI Сотрудников */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-900">
            Финансовые показатели по филиалам сети
          </h2>
          <table className="w-full text-xs text-left tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Филиал</th>
                <th className="py-2 px-2.5 font-medium text-right">Заказов</th>
                <th className="py-2 px-2.5 font-medium text-right">Выручка</th>
                <th className="py-2 px-2.5 font-medium text-right">Себестоимость</th>
                <th className="py-2 px-2.5 font-medium text-right">Чистая прибыль</th>
                <th className="py-2 pl-2.5 font-medium text-right">Средний чек</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {branchRows.map((row) => (
                <tr key={row.branch.id} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-slate-900">{row.branch.name}</div>
                    <div className="text-[11px] text-slate-500">{row.branch.city}</div>
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular whitespace-nowrap">
                    {row.ordersCount}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold whitespace-nowrap">
                    {formatCurrency(row.revenue)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular text-slate-600 whitespace-nowrap">
                    {formatCurrency(row.costPrice)}
                  </td>
                  <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                    {formatCurrency(row.netProfit)}
                  </td>
                  <td className="py-2.5 pl-2.5 text-right font-mono-tabular whitespace-nowrap">
                    {formatCurrency(row.avgCheck)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 overflow-x-auto">
          <h2 className="text-sm font-semibold text-slate-900">
            Выработка и KPI бонусы сотрудников (Менеджеры и Флористы)
          </h2>
          <table className="w-full text-xs text-left tabular-nums">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500">
                <th className="py-2 pr-3 font-medium">Сотрудник</th>
                <th className="py-2 px-2.5 font-medium">Роль</th>
                <th className="py-2 px-2.5 font-medium text-right">Заказов</th>
                <th className="py-2 px-2.5 font-medium text-right">Сумма заказов</th>
                <th className="py-2 pl-2.5 font-medium text-right">Премия KPI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70">
              {staff
                .filter((s) => s.role === 'MANAGER' || s.role === 'FLORIST')
                .map((member) => {
                  const memberOrders = orders.filter(
                    (o) =>
                      (o.managerUserId === member.id || o.floristUserId === member.id) &&
                      o.status !== 'CANCELLED'
                  );
                  const rev = Math.round(
                    memberOrders.reduce((sum, o) => sum + o.totalPrice, 0) * periodScale.mult
                  );
                  const bonus = Math.round(rev * (member.kpiCommissionPct / 100));
                  return (
                    <tr key={member.id} className="hover:bg-slate-50">
                      <td className="py-2.5 pr-3 font-semibold text-slate-900">
                        {member.fullName}
                      </td>
                      <td className="py-2.5 px-2.5 text-slate-600">{member.role}</td>
                      <td className="py-2.5 px-2.5 text-right font-mono-tabular whitespace-nowrap">
                        {Math.round(memberOrders.length * periodScale.mult)}
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono-tabular font-semibold whitespace-nowrap">
                        {formatCurrency(rev)}
                      </td>
                      <td className="py-2.5 pl-2.5 text-right font-mono-tabular font-semibold text-emerald-700 whitespace-nowrap">
                        {formatCurrency(bonus)} ({member.kpiCommissionPct}%)
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// МОДУЛЬ ЕДИНОЙ БАЗЫ КЛИЕНТОВ, СЕГМЕНТАЦИИ И КАРТОЧКИ КЛИЕНТА
// ============================================================================
interface CustomersDirectoryViewProps {
  customers: Customer[];
  orders: Order[];
  conversations: Conversation[];
  branches: Branch[];
  selectedBranchId: string;
  selectedCustomerForModal: Customer | null;
  onSelectCustomerForModal: (customer: Customer | null) => void;
  onCreateCustomer: (newCustomer: Customer) => void;
  onMergeCustomers: (targetId: string, sourceId: string) => void;
  onOpenCreateOrderForCustomer: (customer: Customer) => void;
}

export const CustomersDirectoryView: React.FC<CustomersDirectoryViewProps> = ({
  customers,
  orders,
  conversations,
  branches,
  selectedBranchId,
  selectedCustomerForModal,
  onSelectCustomerForModal,
  onCreateCustomer,
  onMergeCustomers,
  onOpenCreateOrderForCustomer,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [segmentFilter, setSegmentFilter] = useState<'ALL' | CustomerSegment>('ALL');
  const [isMergeModalOpen, setIsMergeModalOpen] = useState<boolean>(false);
  const [targetMergeId, setTargetMergeId] = useState<string>(customers[0]?.id || '');
  const [sourceMergeId, setSourceMergeId] = useState<string>(customers[1]?.id || '');
  const [isNewCustomerModalOpen, setIsNewCustomerModalOpen] = useState<boolean>(false);
  const [newCustName, setNewCustName] = useState<string>('');
  const [newCustPhone, setNewCustPhone] = useState<string>('');
  const [newCustPrefs, setNewCustPrefs] = useState<string>('');

  const filteredCustomers = useMemo(() => {
    return customers.filter((c) => {
      if (selectedBranchId !== 'ALL' && c.preferredBranchId !== selectedBranchId) {
        return false;
      }
      if (segmentFilter !== 'ALL' && c.segment !== segmentFilter) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.fullName.toLowerCase().includes(q);
        const matchPhone = c.phone.toLowerCase().includes(q);
        const matchPrefs = c.flowerPreferences.toLowerCase().includes(q);
        const matchAddress = c.addresses.some(
          (a) =>
            a.streetAndHouse.toLowerCase().includes(q) ||
            a.recipientName.toLowerCase().includes(q)
        );
        return matchName || matchPhone || matchPrefs || matchAddress;
      }
      return true;
    });
  }, [customers, selectedBranchId, segmentFilter, searchQuery]);

  const handleCreateCustomerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim() || !newCustPhone.trim()) return;
    const created: Customer = {
      id: `cust-${Date.now()}`,
      fullName: newCustName.trim(),
      phone: newCustPhone.trim(),
      preferredBranchId: selectedBranchId === 'ALL' ? branches[0].id : selectedBranchId,
      assignedManagerId: 'usr-mgr-1',
      firstContactAt: new Date().toISOString(),
      firstContactSource: 'PHONE_POS',
      lastOrderAt: null,
      lastOrderSource: null,
      ordersCount: 0,
      completedOrdersCount: 0,
      totalSpentLtv: 0,
      averageCheck: 0,
      personalDiscountPct: 0,
      segment: 'NEW',
      isVip: false,
      tags: ['Новый клиент'],
      flowerPreferences: newCustPrefs.trim() || 'Предпочтения уточняются',
      importantDates: [],
      notes: 'Добавлен менеджером вручную',
      addresses: [],
    };
    onCreateCustomer(created);
    setNewCustName('');
    setNewCustPhone('');
    setNewCustPrefs('');
    setIsNewCustomerModalOpen(false);
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-xl font-bold text-slate-900">
            Клиентская база (Единая карточка клиента и RFM-сегментация)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Автоматический пересчет LTV, среднего чека, неизменный First Touch и адреса получателей
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {customers.length >= 2 && (
            <button
              type="button"
              onClick={() => setIsMergeModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Объединить дубли карточек
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsNewCustomerModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4" />
            Добавить клиента
          </button>
        </div>
      </div>

      {/* Поиск и сегментные вкладки */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Поиск по ФИО, части телефона, цветам или адресу получателя..."
            aria-label="Поиск по базе клиентов"
            className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-slate-900"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
          {(
            [
              ['ALL', 'Все сегменты'],
              ['VIP', 'VIP'],
              ['REGULAR', 'Постоянные'],
              ['CORPORATE', 'Корпоративные'],
              ['NEW', 'Новые'],
              ['SLEEPING', 'Спящие'],
            ] as const
          ).map(([seg, label]) => (
            <button
              key={seg}
              type="button"
              onClick={() => setSegmentFilter(seg)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                segmentFilter === seg
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Таблица клиентов */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto">
        <table className="w-full text-xs text-left tabular-nums">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <th className="py-3 px-4 font-semibold">Клиент и Предпочтения</th>
              <th className="py-3 px-4 font-semibold">Телефон</th>
              <th className="py-3 px-4 font-semibold">Сегмент</th>
              <th className="py-3 px-4 font-semibold text-right">Сумма покупок (LTV)</th>
              <th className="py-3 px-4 font-semibold text-right">Средний чек</th>
              <th className="py-3 px-4 font-semibold text-right">Заказов</th>
              <th className="py-3 px-4 font-semibold">1-е обращение → Посл. заказ</th>
              <th className="py-3 px-4 font-semibold text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70">
            {filteredCustomers.map((cust) => (
              <tr key={cust.id} className="hover:bg-slate-50/80">
                <td className="py-3 px-4">
                  <button
                    type="button"
                    onClick={() => onSelectCustomerForModal(cust)}
                    className="font-semibold text-slate-900 hover:underline text-left"
                  >
                    {cust.fullName}
                  </button>
                  <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                    {cust.flowerPreferences}
                  </p>
                </td>
                <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap">
                  {formatPhoneDisplay(cust.phone)}
                </td>
                <td className="py-3 px-4 text-slate-800 font-medium">
                  {SEGMENT_LABELS[cust.segment]}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular font-bold text-slate-900">
                  {formatCurrency(cust.totalSpentLtv)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular text-slate-700">
                  {formatCurrency(cust.averageCheck)}
                </td>
                <td className="py-3 px-4 text-right font-mono-tabular">
                  {cust.ordersCount} шт
                </td>
                <td className="py-3 px-4 text-slate-600">
                  <span className="font-semibold text-slate-800">
                    {CHANNEL_META[cust.firstContactSource].shortLabel}
                  </span>{' '}
                  ({cust.firstContactAt.slice(0, 10)}) →{' '}
                  <span className="font-semibold text-slate-800">
                    {cust.lastOrderSource
                      ? CHANNEL_META[cust.lastOrderSource].shortLabel
                      : '—'}
                  </span>
                </td>
                <td className="py-3 px-4 text-right whitespace-nowrap space-x-2">
                  <button
                    type="button"
                    onClick={() => onSelectCustomerForModal(cust)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md"
                  >
                    Карточка
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenCreateOrderForCustomer(cust)}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md"
                  >
                    + Заказ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* МОДАЛЬНОЕ ОКНО: Полная единая карточка клиента (Single Customer View) */}
      {selectedCustomerForModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-3 sm:p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={`Единая карточка клиента ${selectedCustomerForModal.fullName}`}
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {selectedCustomerForModal.fullName}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {SEGMENT_LABELS[selectedCustomerForModal.segment]} · Телефон:{' '}
                  {formatPhoneDisplay(selectedCustomerForModal.phone)} · Персональная скидка:{' '}
                  {selectedCustomerForModal.personalDiscountPct}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => onSelectCustomerForModal(null)}
                aria-label="Закрыть карточку клиента"
                className="p-2 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
              {/* Блок метрик */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Общая сумма (LTV)</div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {formatCurrency(selectedCustomerForModal.totalSpentLtv)}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Средний чек</div>
                  <div className="text-base font-bold font-mono-tabular text-slate-900 mt-0.5">
                    {formatCurrency(selectedCustomerForModal.averageCheck)}
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Первое обращение</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {CHANNEL_META[selectedCustomerForModal.firstContactSource].label} (
                    {selectedCustomerForModal.firstContactAt.slice(0, 10)})
                  </div>
                </div>
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="text-slate-500">Последний заказ</div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {selectedCustomerForModal.lastOrderSource
                      ? `${
                          CHANNEL_META[selectedCustomerForModal.lastOrderSource].label
                        } (${selectedCustomerForModal.lastOrderAt?.slice(0, 10)})`
                      : 'Нет заказов'}
                  </div>
                </div>
              </div>

              {/* Предпочтения и адреса доставки */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    Цветочные предпочтения и заметки
                  </h3>
                  <p className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 leading-relaxed">
                    {selectedCustomerForModal.flowerPreferences}
                  </p>
                  {selectedCustomerForModal.notes && (
                    <p className="text-slate-500">
                      Комментарий менеджера: {selectedCustomerForModal.notes}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <MapPin className="w-4 h-4 text-slate-400" />
                    Сохраненные адреса получателей ({selectedCustomerForModal.addresses.length})
                  </h3>
                  <div className="space-y-2">
                    {selectedCustomerForModal.addresses.map((addr) => (
                      <div
                        key={addr.id}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1"
                      >
                        <div className="font-semibold text-slate-900">
                          {addr.label} — Получатель: {addr.recipientName} ({addr.recipientPhone})
                        </div>
                        <div className="text-slate-700">
                          {addr.city}, {addr.streetAndHouse}{' '}
                          {addr.apartmentOffice ? `, ${addr.apartmentOffice}` : ''}
                        </div>
                        {addr.intercomCode && (
                          <div className="text-slate-500 font-mono-tabular">
                            Домофон / Пропуск: {addr.intercomCode}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* История заказов клиента */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Полная история заказов клиента
                </h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left tabular-nums">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
                      <tr>
                        <th className="py-2 px-3">Номер</th>
                        <th className="py-2 px-3">Канал</th>
                        <th className="py-2 px-3">Получатель</th>
                        <th className="py-2 px-3">Статус</th>
                        <th className="py-2 px-3 text-right">Сумма</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {orders
                        .filter((o) => o.customerId === selectedCustomerForModal.id)
                        .map((ord) => (
                          <tr key={ord.id}>
                            <td className="py-2 px-3 font-mono-tabular font-semibold">
                              {ord.orderNumber}
                            </td>
                            <td className="py-2 px-3">
                              {CHANNEL_META[ord.source].shortLabel}
                            </td>
                            <td className="py-2 px-3">{ord.recipientName}</td>
                            <td className="py-2 px-3">{ORDER_STATUS_LABELS[ord.status]}</td>
                            <td className="py-2 px-3 text-right font-mono-tabular font-semibold">
                              {formatCurrency(ord.totalPrice)}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: Объединение (Merge) дублей карточек клиентов */}
      {isMergeModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Объединение карточек клиентов"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Объединение (Merge) дублей карточек клиентов
              </h3>
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              При слиянии все заказы, чаты и адреса получателей переносятся в основную карточку, LTV и средний чек пересчитываются, а источник первого обращения (First Touch) сохраняется от более раннего профиля.
            </p>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Основная карточка (куда объединяем):
                </label>
                <select
                  value={targetMergeId}
                  onChange={(e) => setTargetMergeId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.phone}) — LTV {formatCurrency(c.totalSpentLtv)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Дублирующая карточка (будет влита в основную):
                </label>
                <select
                  value={sourceMergeId}
                  onChange={(e) => setSourceMergeId(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                >
                  {customers
                    .filter((c) => c.id !== targetMergeId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName} ({c.phone}) — LTV {formatCurrency(c.totalSpentLtv)}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsMergeModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  if (targetMergeId && sourceMergeId && targetMergeId !== sourceMergeId) {
                    onMergeCustomers(targetMergeId, sourceMergeId);
                    setIsMergeModalOpen(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Выполнить слияние карточек
              </button>
            </div>
          </div>
        </div>
      )}

      {/* МОДАЛЬНОЕ ОКНО: Создание нового клиента */}
      {isNewCustomerModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Добавление нового клиента"
        >
          <form
            onSubmit={handleCreateCustomerSubmit}
            className="bg-white border border-slate-200 rounded-xl w-full max-w-md p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-bold text-slate-900">Добавить нового клиента</h3>
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="text-slate-400 hover:text-slate-900"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">ФИО клиента *</label>
                <input
                  type="text"
                  required
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  placeholder="Например: Светлана Романова"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">Телефон *</label>
                <input
                  type="text"
                  required
                  value={newCustPhone}
                  onChange={(e) => setNewCustPhone(e.target.value)}
                  placeholder="+7 (999) 000-11-22"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Цветочные предпочтения
                </label>
                <textarea
                  rows={2}
                  value={newCustPrefs}
                  onChange={(e) => setNewCustPrefs(e.target.value)}
                  placeholder="Любимые цветы, гамма, аллергии..."
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setIsNewCustomerModalOpen(false)}
                className="px-4 py-2 text-xs text-slate-600"
              >
                Отмена
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                Сохранить карточку
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
