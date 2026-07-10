import React, { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchHistory } from '../api';

export function TrendChart({ cinema, location, movie, seat_category, date, showtime }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    const loadHistory = async () => {
      setLoading(true);
      const res = await fetchHistory(cinema, location, movie, seat_category, date, showtime);
      if (mounted) {
        // Format scraped_at for display
        const formatted = (res.history || []).map(entry => {
          const d = new Date(entry.scraped_at);
          return {
            ...entry,
            label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
            dateOnly: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
          };
        });
        setData(formatted);
        setLoading(false);
      }
    };
    
    loadHistory();
    
    return () => { mounted = false; };
  }, [cinema, location, movie, seat_category, date, showtime]);

  if (loading) {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <div className="animate-pulse text-xs text-op-muted">Loading trend data...</div>
      </div>
    );
  }

  if (data.length <= 1) {
    return (
      <div className="flex h-32 w-full items-center justify-center">
        <div className="text-xs text-op-muted italic">Not enough historical data to show trend</div>
      </div>
    );
  }

  return (
    <div className="h-32 w-full pt-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
          <XAxis 
            dataKey="dateOnly" 
            tick={{ fill: '#80808a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
          />
          <YAxis 
            tick={{ fill: '#80808a', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={['auto', 'auto']}
          />
          <Tooltip 
            contentStyle={{ backgroundColor: '#1e1e24', border: '1px solid #2e2e38', borderRadius: '8px', fontSize: '12px' }}
            itemStyle={{ color: '#ffffff' }}
            labelStyle={{ color: '#80808a', marginBottom: '4px' }}
            labelFormatter={(label, payload) => {
              if (payload && payload.length > 0) {
                return payload[0].payload.label;
              }
              return label;
            }}
            formatter={(value) => [`₹${value}`, 'Price']}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#6d5df6" 
            strokeWidth={2}
            dot={{ r: 3, fill: '#6d5df6', strokeWidth: 0 }}
            activeDot={{ r: 5, fill: '#fff', stroke: '#6d5df6', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
