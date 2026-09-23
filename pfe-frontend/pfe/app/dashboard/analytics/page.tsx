'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Target, Activity, BarChart2, Film, ChevronRight } from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Cell,
} from 'recharts'
import { analyticsApi } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useTranslation } from '@/context/LanguageContext'
import { Card, CardHeader, CardBody } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { PageHeader } from '@/components/ui/PageHeader'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Spinner } from '@/components/ui/Spinner'
import { filterActivityByRange, getScoreDistribution, normalizeAnalyticsDashboard } from '@/lib/analytics'
import type { AnalyticsDashboard, ScenarioStat } from '@/types'

const tooltipStyle = {
  backgroundColor: 'var(--lux-surface)',
  border: '1px solid var(--lux-line-strong)',
  borderRadius: '0.875rem',
  color: 'var(--lux-text-strong)',
  fontSize: 12,
  boxShadow: 'var(--lux-shadow)',
  padding: '10px 14px',
}

function KpiCard({ icon: Icon, label, value, sub, color }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; color: string
}) {
  return (
    <Card variant="glass" className="p-5 transition-all duration-300 hover:-translate-y-1">
      <div className="flex items-start gap-3.5">
        <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-[var(--lux-line)] ${color}`}>
          <Icon size={19} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold text-[var(--lux-muted-soft)] uppercase tracking-wider mb-0.5">{label}</p>
          <p className="text-2xl font-extrabold tracking-tight text-[var(--lux-text-strong)]">{value}</p>
          {sub && <p className="text-xs font-medium text-[var(--lux-muted-soft)] mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  )
}

export default function AnalyticsPage() {
  const { isAdmin } = useAuth()
  const { t } = useTranslation()
  const [range, setRange] = useState(30)
  const [drillDown, setDrillDown] = useState<ScenarioStat | null>(null)

  const dateRanges = [
    { label: t('analytics_range_7'), value: 7 },
    { label: t('analytics_range_30'), value: 30 },
    { label: t('analytics_range_90'), value: 90 },
  ]

  const { data, isLoading } = useQuery<AnalyticsDashboard>({
    queryKey: ['analytics-full', isAdmin ? 'admin' : 'me', range],
    queryFn: () =>
      (isAdmin ? analyticsApi.getDashboard(range) : analyticsApi.getMyStats(range))
        .then(r => normalizeAnalyticsDashboard(r.data)),
  })

  const stats = data ?? normalizeAnalyticsDashboard(null)
  const trendData = filterActivityByRange(stats.recentActivity, range)
  const scoreDistribution = getScoreDistribution(stats.topScenarios)
  const hasScores = scoreDistribution.some(item => item.count > 0)

  const tableHeaders = [
    t('analytics_table_scenario'),
    t('analytics_table_status'),
    t('analytics_table_attempts'),
    t('analytics_table_completion'),
    t('analytics_table_success'),
    t('analytics_table_avg_score'),
    '',
  ]

  return (
    <div className="space-y-6 fade-up">
      <PageHeader
        eyebrow={t('analytics_eyebrow')}
        title={t('analytics_title')}
        description={isAdmin ? t('analytics_description_admin') : t('analytics_description_user')}
        actions={
          <SegmentedControl
            items={dateRanges}
            value={range}
            onChange={setRange}
            ariaLabel={t('analytics_title')}
          />
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard icon={Film} label={t('analytics_kpi_total')} value={stats.totalScenarios ?? '-'} color="bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]" />
            <KpiCard icon={Target} label={t('analytics_kpi_completion')} value={`${stats.avgCompletionRate ?? 0}%`} sub={t('analytics_kpi_sub')} color="bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]" />
            <KpiCard icon={Activity} label={t('analytics_kpi_attempts')} value={stats.totalAttempts ?? '-'} color="bg-[var(--lux-gold-soft)] text-[var(--lux-gold)]" />
            <KpiCard icon={TrendingUp} label={t('analytics_kpi_score')} value={`${stats.avgScore ?? 0}%`} color="bg-[var(--lux-violet-soft)] text-[var(--lux-violet)]" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Card variant="glass" className="lg:col-span-2">
              <CardHeader>
                <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">{t('analytics_chart_completions')}</h3>
                <BarChart2 size={16} className="text-[var(--lux-muted-soft)]" />
              </CardHeader>
              <CardBody>
                {trendData.length ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <AreaChart data={trendData}>
                      <defs>
                        <linearGradient id="compGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="var(--lux-primary)" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="var(--lux-primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke="var(--lux-line)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fill: 'var(--lux-muted-soft)', fontSize: 11 }}
                        tickFormatter={(val: string) => (val ? val.slice(5) : '')}
                        minTickGap={20}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis tick={{ fill: 'var(--lux-muted-soft)', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: 'var(--lux-text-strong)' }}
                        labelStyle={{ color: 'var(--lux-muted)', fontWeight: 600, marginBottom: 4 }}
                      />
                      <Area type="monotone" dataKey="count" stroke="var(--lux-primary)" fill="url(#compGrad)" strokeWidth={2.5} dot={false} name="Activity" />
                      <Area type="monotone" dataKey="completions" stroke="var(--lux-gold)" fill="none" strokeWidth={1.5} dot={false} strokeDasharray="4 2" name="Completions" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[230px] items-center justify-center text-xs text-[var(--lux-muted-soft)]">
                    {t('analytics_chart_no_trend')}
                  </div>
                )}
              </CardBody>
            </Card>

            <Card variant="glass">
              <CardHeader>
                <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">{t('analytics_chart_scores')}</h3>
              </CardHeader>
              <CardBody>
                {hasScores ? (
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart data={scoreDistribution}>
                      <XAxis dataKey="range" tick={{ fill: 'var(--lux-muted-soft)', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--lux-muted-soft)', fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                      <Tooltip
                        contentStyle={tooltipStyle}
                        itemStyle={{ color: 'var(--lux-text-strong)' }}
                        labelStyle={{ color: 'var(--lux-muted)', fontWeight: 600, marginBottom: 4 }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} name="Scenarios">
                        {scoreDistribution.map((_, i) => (
                          <Cell key={i} fill={i >= 3 ? 'var(--lux-primary)' : 'var(--lux-muted-soft)'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-[230px] items-center justify-center text-xs text-[var(--lux-muted-soft)]">
                    {t('analytics_chart_no_scores')}
                  </div>
                )}
              </CardBody>
            </Card>
          </div>

          <Card variant="glass">
            <CardHeader>
              <div>
                <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">{t('analytics_table_title')}</h3>
                <p className="mt-0.5 text-xs text-[var(--lux-muted-soft)]">{t('analytics_table_subtitle')}</p>
              </div>
            </CardHeader>
            <CardBody className="pt-0">
              <div className="overflow-x-auto pb-2 lux-scrollbar">
                <table className="min-w-[820px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--lux-line)]/80">
                      {tableHeaders.map((h, i) => (
                        <th key={i} className="text-left text-xs font-bold uppercase tracking-wider text-[var(--lux-muted-soft)] pb-3 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--lux-line)]/60">
                    {(stats.topScenarios ?? []).map((s: ScenarioStat) => (
                      <tr key={s.id} className="hover:bg-[var(--lux-overlay-hover)] cursor-pointer group transition-colors" onClick={() => setDrillDown(s)}>
                        <td className="py-3.5 pr-4">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]">
                              <Film size={14} />
                            </span>
                            <span className="text-[var(--lux-text-strong)] font-bold truncate max-w-[220px] group-hover:text-[var(--lux-primary-muted)] transition-colors">{s.title}</span>
                          </div>
                        </td>
                        <td className="py-3.5 pr-4"><StatusBadge status={s.status} /></td>
                        <td className="py-3.5 pr-4 font-semibold text-[var(--lux-text)]">{s.attempts ?? s.completions}</td>
                        <td className="py-3.5 pr-4 font-semibold text-[var(--lux-text)]">{s.completionRate ?? 0}%</td>
                        <td className="py-3.5 pr-4 font-semibold text-[var(--lux-text)]">{s.successRate ?? 0}%</td>
                        <td className="py-3.5 pr-4">
                          <span className={s.avgScore >= 70 ? 'text-[var(--lux-primary-muted)] font-extrabold' : 'text-[var(--lux-gold)] font-extrabold'}>{s.avgScore}%</span>
                        </td>
                        <td className="py-3.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={15} className="text-[var(--lux-primary-muted)]" />
                        </td>
                      </tr>
                    ))}
                    {!stats.topScenarios?.length && (
                      <tr><td colSpan={7} className="py-12 text-center text-[var(--lux-muted-soft)] text-xs font-medium">{t('analytics_table_empty')}</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardBody>
          </Card>
        </>
      )}

      {drillDown && (
        <Modal open onClose={() => setDrillDown(null)} title={drillDown.title} size="md">
          <div className="grid grid-cols-2 gap-3.5">
            {[
              { label: t('analytics_detail_completions'), value: drillDown.completions },
              { label: t('analytics_detail_attempts'), value: drillDown.attempts ?? drillDown.completions },
              { label: t('analytics_detail_completion_rate'), value: `${drillDown.completionRate ?? 0}%` },
              { label: t('analytics_detail_success_rate'), value: `${drillDown.successRate ?? 0}%` },
              { label: t('analytics_detail_avg_score'), value: `${drillDown.avgScore}%` },
              { label: t('analytics_detail_avg_time'), value: drillDown.avgTime ? `${drillDown.avgTime}m` : '-' },
              { label: t('analytics_detail_status'), value: <StatusBadge status={drillDown.status} /> },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--lux-surface-soft)] border border-[var(--lux-line)]/80 rounded-xl p-3.5">
                <p className="text-xs text-[var(--lux-muted-soft)] mb-1 font-semibold uppercase tracking-wider">{label}</p>
                <p className="text-base font-extrabold text-[var(--lux-text-strong)]">{value as React.ReactNode}</p>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  )
}
