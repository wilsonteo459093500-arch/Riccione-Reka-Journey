import React, { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts';
import { CheckCircle2, AlertCircle, TrendingUp } from 'lucide-react';
import { PIPELINE_STAGE_ORDER, SALES_STAGES, WON_STAGES, DROPPED_STAGE } from '../../constants.js';
import { fmtMoneyShort } from '../../utils.js';
import { Card, ExportMenu } from '../Shared.jsx';

const COLORS = ['#3D5A4A', '#A87C4F', '#B8995A', '#6B8E7F', '#9C6B5C', '#2D4A3E', '#C89B5A', '#7E7466'];

export default function AnalyticsView({ leads }) {
  const sourceAnalysis = useMemo(() => {
    const m = {};
    leads.forEach(l => {
      const k = l.leadSource || 'Unknown';
      if (!m[k]) m[k] = { name: k, total: 0, won: 0, dropped: 0, active: 0, pipelineValue: 0, wonValue: 0 };
      m[k].total += 1;
      if (WON_STAGES.includes(l.salesStage)) {
        m[k].won += 1;
        m[k].wonValue += Number(l.quotationAmount) || 0;
      } else if (l.salesStage === DROPPED_STAGE) {
        m[k].dropped += 1;
      } else {
        m[k].active += 1;
        m[k].pipelineValue += Number(l.quotationAmount) || 0;
      }
    });
    return Object.values(m)
      .map(x => ({ ...x, conversionRate: x.total > 0 ? (x.won / x.total) * 100 : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [leads]);

  const funnelData = useMemo(() => {
    const order = PIPELINE_STAGE_ORDER;
    return order.map(s => ({
      stage: SALES_STAGES.find(x => x.value === s)?.short || s,
      count: leads.filter(l => l.salesStage === s).length,
      color: SALES_STAGES.find(x => x.value === s)?.color || '#9A8F7E',
    }));
  }, [leads]);

  const clientTypeData = useMemo(() => {
    const m = {};
    leads.forEach(l => {
      const k = l.clientType || 'Unknown';
      if (!m[k]) m[k] = { name: k, count: 0, value: 0 };
      m[k].count += 1;
      m[k].value += Number(l.quotationAmount) || 0;
    });
    return Object.values(m).sort((a, b) => b.count - a.count);
  }, [leads]);

  const regionData = useMemo(() => {
    const m = {};
    leads.forEach(l => {
      const region = (l.region || 'Unspecified').split(',')[0].trim() || 'Unspecified';
      if (!m[region]) m[region] = { name: region, count: 0, value: 0 };
      m[region].count += 1;
      m[region].value += Number(l.quotationAmount) || 0;
    });
    return Object.values(m).sort((a, b) => b.count - a.count).slice(0, 12);
  }, [leads]);

  const insights = useMemo(() => {
    const out = [];
    const top = sourceAnalysis[0];
    if (top) out.push({
      type: 'success',
      title: `${top.name} is your top lead generator`,
      detail: `${top.total} leads (${((top.total / leads.length) * 100).toFixed(0)}% of total) with ${top.conversionRate.toFixed(0)}% conversion.`
    });
    const bestConv = [...sourceAnalysis].filter(s => s.total >= 3).sort((a, b) => b.conversionRate - a.conversionRate)[0];
    if (bestConv && bestConv.conversionRate > 0) out.push({
      type: 'info',
      title: `${bestConv.name} has the highest conversion rate`,
      detail: `${bestConv.conversionRate.toFixed(0)}% conversion across ${bestConv.total} leads. Consider scaling this channel even if volume is lower.`
    });
    const fromSailChina = sourceAnalysis.find(s => s.name === 'From Sail China');
    if (fromSailChina && fromSailChina.total > 0 && fromSailChina.won === 0) out.push({
      type: 'warning',
      title: 'Sail China leads are not converting',
      detail: `${fromSailChina.total} leads inherited from Sail China, ${fromSailChina.dropped} dropped, 0 won. Pricing pushback and remote-buying friction are common reasons.`
    });
    const stage2 = leads.filter(l => l.salesStage.startsWith('Stage 2:')).length;
    const stage3 = leads.filter(l => l.salesStage === 'Stage 3: Design').length;
    if (stage2 > stage3 * 3 && stage2 > 5) out.push({
      type: 'warning',
      title: 'Bottleneck at Stage 2 → Stage 3',
      detail: `${stage2} leads stuck at Stage 2 (showroom/quote) vs ${stage3} at Design. The handoff between quotation and design commitment is leaking.`
    });
    return out;
  }, [sourceAnalysis, leads]);

  return (
    <div className="space-y-5 pt-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl text-sail-ink font-semibold">Analytics</h1>
          <p className="text-xs text-sail-muted mt-0.5">Strategic insights for sales planning</p>
        </div>
        <ExportMenu
          rows={sourceAnalysis.map(s => ({
            Source: s.name, Total: s.total, Won: s.won, Dropped: s.dropped,
            Active: s.active, 'Conversion %': s.conversionRate.toFixed(1),
            'Pipeline Value (RM)': s.pipelineValue, 'Won Value (RM)': s.wonValue,
          }))}
          title="Source Analysis" filename="Sail_Analytics"
        />
      </div>

      {insights.length > 0 && (
        <div className="space-y-2">
          {insights.map((ins, i) => (
            <div
              key={i}
              className="bg-white border-l-4 border border-sail-line rounded-md p-3 flex items-start gap-3"
              style={{ borderLeftColor: ins.type === 'success' ? '#3D5A4A' : ins.type === 'warning' ? '#9C6B5C' : '#A87C4F' }}
            >
              <div className="flex-shrink-0 mt-0.5">
                {ins.type === 'success' && <CheckCircle2 className="w-4 h-4 text-sail-green" />}
                {ins.type === 'warning' && <AlertCircle className="w-4 h-4 text-sail-danger" />}
                {ins.type === 'info'    && <TrendingUp  className="w-4 h-4 text-sail-brown" />}
              </div>
              <div>
                <div className="font-semibold text-sm text-sail-ink">{ins.title}</div>
                <div className="text-xs text-sail-muted mt-0.5">{ins.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Card>
        <h3 className="font-display text-lg text-sail-ink font-semibold mb-1">Lead Source Performance</h3>
        <p className="text-xs text-sail-muted mb-3">Where your best leads come from</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sail-line">
                {['Source', 'Total', 'Active', 'Won', 'Dropped', 'Conv. Rate', 'Pipeline Value'].map((h, i) => (
                  <th key={h} className={`py-2 text-[10px] uppercase tracking-wider text-sail-muted font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sourceAnalysis.map(s => (
                <tr key={s.name} className="border-b border-sail-line last:border-0">
                  <td className="py-2 font-medium text-sail-ink">{s.name}</td>
                  <td className="py-2 text-right text-sail-ink">{s.total}</td>
                  <td className="py-2 text-right text-sail-muted">{s.active}</td>
                  <td className="py-2 text-right text-sail-green font-medium">{s.won}</td>
                  <td className="py-2 text-right text-sail-danger">{s.dropped}</td>
                  <td className="py-2 text-right">
                    <span className={`font-medium ${s.conversionRate >= 20 ? 'text-sail-green' : s.conversionRate >= 10 ? 'text-sail-brown' : 'text-sail-danger'}`}>
                      {s.conversionRate.toFixed(0)}%
                    </span>
                  </td>
                  <td className="py-2 text-right font-semibold text-sail-ink">{fmtMoneyShort(s.pipelineValue + s.wonValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="font-display text-lg text-sail-ink font-semibold mb-1">Conversion Funnel</h3>
          <p className="text-xs text-sail-muted mb-3">Stage-by-stage volume</p>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={funnelData} layout="vertical" margin={{ left: 0, right: 30 }}>
              <CartesianGrid horizontal={false} stroke="#E0D8C8" />
              <XAxis type="number" stroke="#7E7466" fontSize={11} />
              <YAxis dataKey="stage" type="category" stroke="#5C5247" fontSize={10} width={120} />
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E0D8C8', borderRadius: 6, fontSize: 12 }} />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {funnelData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="font-display text-lg text-sail-ink font-semibold mb-1">Client Mix</h3>
          <p className="text-xs text-sail-muted mb-3">By client type</p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={clientTypeData} dataKey="count" nameKey="name" cx="50%" cy="50%"
                outerRadius={90} innerRadius={50}
                label={({ name, count }) => `${name}: ${count}`} labelLine={false}>
                {clientTypeData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#fff', border: '1px solid #E0D8C8', borderRadius: 6, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card>
        <h3 className="font-display text-lg text-sail-ink font-semibold mb-1">Top Regions</h3>
        <p className="text-xs text-sail-muted mb-3">Where customers are based</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
          {regionData.map(r => (
            <div key={r.name} className="border border-sail-line rounded-md p-2.5">
              <div className="font-medium text-sm text-sail-ink truncate">{r.name}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-sail-muted">{r.count} leads</span>
                {r.value > 0 && <span className="text-xs font-semibold text-sail-green">{fmtMoneyShort(r.value)}</span>}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
