import { Building2, IndianRupee, TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from '../ui/Card';
import { formatPercent, formatPrice } from '../../lib/format';
import { cn } from '../../utils/cn';

function Kpi({ label, value, hint, icon: Icon, tone = 'default', bar }) {
  const toneClass = {
    default: 'text-ink',
    above: 'text-above',
    below: 'text-below',
    brand: 'text-brand-soft',
  }[tone];

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="label-micro truncate">{label}</span>
        <Icon size={15} className="shrink-0 text-ink-muted" aria-hidden="true" />
      </div>
      <p className={cn('tabular text-2xl font-semibold leading-none', toneClass)}>{value}</p>
      {bar}
      {hint && <p className="text-xs text-ink-muted">{hint}</p>}
    </Card>
  );
}

/**
 * Headline metrics for the current filter selection. Framed from Devgn Cinex's
 * point of view: "above" means a competitor is charging more than our baseline,
 * which is favourable to us.
 */
export function KpiRow({ summary }) {
  const { owned, competitors, above, below, compared, premiumShare, averagePrice, showCount } = summary;

  const abovePct = compared ? (above / compared) * 100 : 0;
  const belowPct = compared ? (below / compared) * 100 : 0;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Kpi
        label="Venues"
        value={owned + competitors}
        hint={`${owned} owned · ${competitors} competitor · ${showCount} shows`}
        icon={Building2}
        tone="brand"
      />
      <Kpi
        label="Above us"
        value={above}
        hint={compared ? `${formatPercent(premiumShare)} of ${compared} comparable prices` : 'No baseline yet'}
        icon={TrendingUp}
        tone="above"
      />
      <Kpi
        label="Below us"
        value={below}
        hint={compared ? `${formatPercent(compared ? below / compared : null)} of comparable prices` : 'No baseline yet'}
        icon={TrendingDown}
        tone="below"
      />
      <Kpi
        label="Avg ticket"
        value={formatPrice(averagePrice)}
        hint="Across every visible seat category"
        icon={IndianRupee}
        bar={
          compared > 0 && (
            // Compact share-of-market bar: how the comparable prices split.
            <div
              className="flex h-1.5 overflow-hidden rounded-pill bg-elevated"
              role="img"
              aria-label={`${above} prices above our baseline, ${below} below, ${compared - above - below} level`}
            >
              <div className="bg-above" style={{ width: `${abovePct}%` }} />
              <div className="bg-below" style={{ width: `${belowPct}%` }} />
            </div>
          )
        }
      />
    </div>
  );
}
