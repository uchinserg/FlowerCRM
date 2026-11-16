import React, { useState } from 'react';
import {
  AuditLogEntry,
  Branch,
  EncryptedChannelVaultItem,
  Order,
  RoleCode,
} from '../types/crm';
import {
  RBAC_ROLE_MATRIX,
  formatCurrency,
  formatPhoneDisplay,
} from '../utils/crmLogic';
import { CHANNEL_META } from './ChannelBadge';
import {
  Building2,
  Check,
  KeyRound,
  Lock,
  MapPin,
  Phone,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';

interface SecurityRbacViewProps {
  currentRole: RoleCode;
  onSelectRole: (role: RoleCode) => void;
  branches: Branch[];
  onAddBranch: (branch: Branch) => void;
  vaultItems: EncryptedChannelVaultItem[];
  onRotateVaultKey: (vaultId: string) => void;
  auditLogs: AuditLogEntry[];
  orders: Order[];
}

export const SecurityRbacView: React.FC<SecurityRbacViewProps> = ({
  currentRole,
  onSelectRole,
  branches,
  onAddBranch,
  vaultItems,
  onRotateVaultKey,
  auditLogs,
  orders,
}) => {
  const [newBranchCity, setNewBranchCity] = useState('Казань');
  const [newBranchName, setNewBranchName] = useState('Салон на Кремлевской');
  const [newBranchCode, setNewBranchCode] = useState('KZN-KRM');
  const [newBranchAddress, setNewBranchAddress] = useState('ул. Кремлевская, 18');
  const [newBranchPhone, setNewBranchPhone] = useState('+7 (843) 205-18-00');

  const activeProfile = RBAC_ROLE_MATRIX[currentRole];
  const allRoles: RoleCode[] = ['ADMIN', 'DIRECTOR', 'MANAGER', 'FLORIST', 'COURIER'];

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName.trim() || !newBranchCode.trim()) return;
    onAddBranch({
      id: `br-${Date.now()}`,
      code: newBranchCode.trim().toUpperCase(),
      name: newBranchName.trim(),
      city: newBranchCity.trim(),
      address: newBranchAddress.trim(),
      phone: newBranchPhone.trim(),
    });
    setNewBranchName('');
    setNewBranchCode('');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      {/* Шапка модуля Безопасности, RBAC и Инфраструктуры */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h1 className="text-lg font-bold text-slate-900">
              Этап 7: Ролевая модель (RBAC), Шифрование AES-256-GCM и Инфраструктура
            </h1>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Переключайте активную роль сотрудника в реальном времени, чтобы проверить изоляцию филиалов, скрытие себестоимости, блокировку выгрузки базы в Excel и мобильный терминал курьера.
          </p>
        </div>

        {/* Переключатель ролей RBAC в 1 клик */}
        <div className="flex flex-wrap items-center gap-1.5">
          {allRoles.map((r) => {
            const prof = RBAC_ROLE_MATRIX[r];
            const isSelected = currentRole === r;
            return (
              <button
                key={r}
                type="button"
                onClick={() => onSelectRole(r)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {prof.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Если выбрана роль КУРЬЕР: специализированный мобильный терминал доставки */}
      {currentRole === 'COURIER' && (
        <div className="bg-slate-900 text-white rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Truck className="w-5 h-5 text-emerald-400" />
              <div>
                <h2 className="text-sm font-bold">
                  Мобильный терминал курьера (RBAC Projection: COURIER)
                </h2>
                <p className="text-xs text-slate-400">
                  Себестоимость, маржа, LTV заказчика и экспорт базы физически исключены из API-ответа. Доступны только адрес, домофон, телефон получателя и остаток к оплате.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {orders
              .filter((o) => o.fulfillmentType === 'DELIVERY' && o.status !== 'CANCELLED')
              .map((order) => (
                <div
                  key={order.id}
                  className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono-tabular">
                      <span className="font-bold text-white">{order.orderNumber}</span>
                      <span className="text-emerald-400 font-semibold">
                        Окно: {order.deliveryWindow}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 space-y-1.5 pt-1">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-white">
                            {order.deliveryAddress}
                          </div>
                          {order.intercomCode && (
                            <div className="text-amber-300 font-mono-tabular mt-0.5">
                              Домофон / Охрана: {order.intercomCode}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                        <span>
                          Получатель: <strong>{order.recipientName}</strong> (
                          <span className="font-mono-tabular">
                            {formatPhoneDisplay(order.recipientPhone)}
                          </span>
                          )
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-700 flex items-center justify-between">
                    <span className="text-xs text-slate-400">К получению с клиента:</span>
                    <span
                      className={`text-sm font-bold font-mono-tabular ${
                        order.debtAmount > 0 ? 'text-amber-400' : 'text-emerald-400'
                      }`}
                    >
                      {order.debtAmount > 0
                        ? `Доплата: ${formatCurrency(order.debtAmount)}`
                        : 'Оплачено (0 ₽)'}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Матрица прав доступа RBAC */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              1. Матрица разграничения прав доступа (RBAC Middleware & Field Masking)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Текущий профиль: <strong className="text-slate-900">{activeProfile.title}</strong> — {activeProfile.scopeDescription}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Роль сотрудника</th>
                <th className="py-3 px-3 text-center">Все филиалы</th>
                <th className="py-3 px-3 text-center">Чаты и Клиенты</th>
                <th className="py-3 px-3 text-center">Себестоимость и Прибыль</th>
                <th className="py-3 px-3 text-center">Экспорт базы в Excel</th>
                <th className="py-3 px-3 text-center">Шифрование и Филиалы</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {allRoles.map((r) => {
                const prof = RBAC_ROLE_MATRIX[r];
                const isCurrent = r === currentRole;
                return (
                  <tr
                    key={r}
                    className={isCurrent ? 'bg-slate-900/5 font-medium' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-900">
                        {prof.title}{' '}
                        {isCurrent && (
                          <span className="text-[11px] text-rose-700 font-mono-tabular">
                            · АКТИВНА
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 max-w-md">
                        {prof.scopeDescription}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center">
                      {prof.canAccessAllBranches ? (
                        <Check className="w-4 h-4 text-emerald-600 inline" />
                      ) : (
                        <span className="text-[11px] text-slate-500">Только свой</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {prof.canAccessChat ? (
                        <Check className="w-4 h-4 text-emerald-600 inline" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 inline" />
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {prof.canViewCostAndProfit ? (
                        <Check className="w-4 h-4 text-emerald-600 inline" />
                      ) : (
                        <X className="w-4 h-4 text-rose-500 inline" />
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {prof.canExportExcelDatabase ? (
                        <Check className="w-4 h-4 text-emerald-600 inline" />
                      ) : (
                        <X className="w-4 h-4 text-rose-500 inline" />
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {prof.canManageIntegrationsAndBranches ? (
                        <Check className="w-4 h-4 text-emerald-600 inline" />
                      ) : (
                        <X className="w-4 h-4 text-slate-300 inline" />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Сетка: Хранилище ключей AES-256-GCM + Масштабирование филиалов */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        {/* Хранилище токенов площадок (AES-256-GCM) */}
        <div className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">
                2. Шифрование API-токенов каналов в БД (AES-256-GCM Envelope)
              </h2>
            </div>
            <span className="text-xs font-mono-tabular text-slate-500">
              Master Key: ENV KMS v3
            </span>
          </div>

          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-2.5 px-4">Канал / Коннектор</th>
                  <th className="py-2.5 px-3">Шифр / IV / Tag</th>
                  <th className="py-2.5 px-3">Маска токена</th>
                  <th className="py-2.5 px-3 text-right">Ротация ключа</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {vaultItems.map((item) => {
                  const chMeta = CHANNEL_META[item.source];
                  const canRotate = activeProfile.canManageIntegrationsAndBranches;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">
                          <span className={chMeta.accentText}>{chMeta.shortLabel}</span> ·{' '}
                          {item.label}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono-tabular">
                          Режим: {item.webhookMode} · Key v{item.keyVersion}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-[11px] text-slate-600">
                        <div>{item.cipherAlgorithm}</div>
                        <div className="text-slate-400">
                          IV:{item.ivHexPreview} · Tag:{item.authTagHexPreview}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono-tabular text-slate-800">
                        {item.maskedTokenPreview}
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          disabled={!canRotate}
                          onClick={() => onRotateVaultKey(item.id)}
                          title={
                            canRotate
                              ? 'Перешифровать токен новым вектором инициализации IV'
                              : 'Доступно только Владельцу / Админу'
                          }
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                            canRotate
                              ? 'bg-slate-900 text-white hover:bg-slate-800'
                              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          }`}
                        >
                          <RefreshCw className="w-3 h-3" />
                          Ротация IV
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Масштабирование: Добавление нового филиала без переписывания ядра */}
        <div className="xl:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-slate-700" />
              <h2 className="text-sm font-bold text-slate-900">
                3. Масштабирование сети (Подключение нового филиала)
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Благодаря мультитенантной схеме <code className="font-mono-tabular">branch_id</code> и реестру адаптеров <code className="font-mono-tabular">ChannelAdapterRegistry</code> новый салон подключается без изменения кода ядра.
            </p>

            <form onSubmit={handleCreateBranch} className="space-y-3 pt-1">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Город
                  </label>
                  <input
                    type="text"
                    value={newBranchCity}
                    onChange={(e) => setNewBranchCity(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Код филиала (префикс заказов)
                  </label>
                  <input
                    type="text"
                    value={newBranchCode}
                    onChange={(e) => setNewBranchCode(e.target.value)}
                    placeholder="KZN-KRM"
                    className="w-full px-3 py-1.5 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Название салона / студии
                </label>
                <input
                  type="text"
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="Салон на Кремлевской"
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Адрес салона
                  </label>
                  <input
                    type="text"
                    value={newBranchAddress}
                    onChange={(e) => setNewBranchAddress(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Телефон салона
                  </label>
                  <input
                    type="text"
                    value={newBranchPhone}
                    onChange={(e) => setNewBranchPhone(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono-tabular border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={!activeProfile.canManageIntegrationsAndBranches}
                className={`w-full py-2 px-4 rounded-lg text-xs font-semibold transition-colors ${
                  activeProfile.canManageIntegrationsAndBranches
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
              >
                {activeProfile.canManageIntegrationsAndBranches
                  ? '+ Зарегистрировать новый филиал в сети'
                  : 'Добавление филиалов доступно только Владельцу (ADMIN)'}
              </button>
            </form>
          </div>

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-emerald-600" />
              Активных филиалов в кластере: <strong>{branches.length}</strong>
            </span>
            <span className="font-mono-tabular text-[11px] text-slate-500">
              Docker: App + PG16 + Redis7 + MinIO S3
            </span>
          </div>
        </div>
      </div>

      {/* Журнал аудита безопасности (Audit Log) */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-600" />
            <h2 className="text-sm font-bold text-slate-900">
              4. Неизменяемый журнал аудита действий сотрудников (Security Audit Log)
            </h2>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            Записей: {auditLogs.length}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold">
                <th className="py-2.5 px-4">Время (UTC)</th>
                <th className="py-2.5 px-3">Сотрудник / Роль</th>
                <th className="py-2.5 px-3">Событие / Объект</th>
                <th className="py-2.5 px-3">Описание и Дельта изменений (Before → After)</th>
                <th className="py-2.5 px-4 text-right">IP-адрес</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {auditLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50">
                  <td className="py-2.5 px-4 font-mono-tabular text-slate-500 whitespace-nowrap">
                    {log.timestamp.replace('T', ' ').slice(0, 19)}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{log.actorName}</div>
                    <div className="text-[11px] text-slate-500 font-mono-tabular">
                      {log.actorRole} · {log.branchId}
                    </div>
                  </td>
                  <td className="py-2.5 px-3 font-mono-tabular whitespace-nowrap">
                    <div className="font-semibold text-slate-800">{log.action}</div>
                    <div className="text-[11px] text-slate-500">
                      {log.entityType}: {log.entityId}
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="text-slate-800">{log.summary}</div>
                    {(log.previousValue || log.newValue) && (
                      <div className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
                        {log.previousValue} →{' '}
                        <span className="text-slate-900 font-semibold">
                          {log.newValue}
                        </span>
                      </div>
                    )}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-500 whitespace-nowrap">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
