import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDate } from '../../domain/format';

type DataRow = { date: string; [key: string]: string | number | null };
type Series = { key: string; label: string; color: string; area?: boolean; dashed?: boolean };

export function TimeSeriesChart({ data, series, valueSuffix = 'L', valuePrefix = '', startAtZero = true, label }: { data: DataRow[]; series: Series[]; valueSuffix?: string; valuePrefix?: string; startAtZero?: boolean; label: string }) {
  if (!data.length) return <div className="chart-empty">Sem medições neste período.</div>;
  const normalized = data.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, key === 'date' || value === null ? value : Number(value)])));
  return <div className="chart-wrap" role="img" aria-label={label}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={normalized} margin={{ top: 14, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="#dce1da" strokeDasharray="3 4" vertical={false} />
        <XAxis dataKey="date" tickFormatter={(value) => formatDate(String(value)).slice(0, 5)} tick={{ fill: '#647068', fontSize: 12 }} axisLine={false} tickLine={false} minTickGap={20} />
        <YAxis tick={{ fill: '#647068', fontSize: 12 }} axisLine={false} tickLine={false} width={62} tickFormatter={(value) => `${valuePrefix}${Number(value).toLocaleString('pt-BR')}${valueSuffix ? ` ${valueSuffix}` : ''}`} domain={startAtZero ? [0, 'auto'] : ['auto', 'auto']} />
        <Tooltip labelFormatter={(value) => formatDate(String(value))} formatter={(value, name) => [`${valuePrefix}${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}${valueSuffix ? ` ${valueSuffix}` : ''}`, name]} contentStyle={{ border: '1px solid #dce1da', borderRadius: 12, background: '#fffef9', boxShadow: '0 6px 20px rgb(31 41 34 / 10%)' }} />
        {series.length > 1 && <Legend />}
        {series.map((item) => item.area ? <Area key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} fill={item.color} fillOpacity={0.13} strokeWidth={3} connectNulls={false} isAnimationActive={false} /> : <Line key={item.key} type="monotone" dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={3} strokeDasharray={item.dashed ? '6 5' : undefined} dot={{ r: 3, fill: '#fffef9', strokeWidth: 2 }} activeDot={{ r: 6 }} connectNulls={false} isAnimationActive={false} />)}
      </ComposedChart>
    </ResponsiveContainer>
  </div>;
}
