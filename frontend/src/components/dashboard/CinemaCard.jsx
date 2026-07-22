import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock } from 'lucide-react';
import { Badge, Chip } from '../ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { formatDiff, formatPrice, formatTimestamp, isStale, timeAgo } from '../../lib/format';
import { cn } from '../../utils/cn';

function PriceRow({ tier, owned }) {
  const showDiff = !owned && tier.hasBaseline;
  const tone = tier.diff > 0 ? 'text-above' : tier.diff < 0 ? 'text-below' : 'text-ink-muted';

  return (
    <div className="flex items-center justify-between gap-3 rounded-control px-2 py-1.5 transition-colors hover:bg-elevated">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm text-ink-soft">{tier.category}</span>
        {showDiff && (
          <span className="text-[11px] text-ink-muted">
            vs {formatPrice(tier.baseline)} baseline
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-3">
        {showDiff ? (
          <span className={cn('tabular text-xs font-semibold', tone)}>
            {tier.diff > 0 ? '▲' : tier.diff < 0 ? '▼' : '='} {formatDiff(tier.diff)}
          </span>
        ) : (
          !owned && (
            <span className="text-[11px] text-ink-muted" title="No comparable Devgn Cinex price">
              no baseline
            </span>
          )
        )}
        <span className="tabular w-16 text-right text-sm font-semibold text-ink">
          {formatPrice(tier.price)}
        </span>
      </div>
    </div>
  );
}

export function CinemaCard({ card }) {
  const [showtime, setShowtime] = useState(card.showtimes[0] ?? null);

  // If filters change and the selected showtime disappears, fall back to the
  // first available one.
  useEffect(() => {
    if (!card.showtimes.includes(showtime)) {
      setShowtime(card.showtimes[0] ?? null);
    }
  }, [card.showtimes, showtime]);

  const tiers = (showtime && card.pricingByShowtime.get(showtime)) || [];
  const stale = isStale(card.scrapedAt);
  const ago = timeAgo(card.scrapedAt);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
      className="h-full"
    >
      <Card interactive accent={card.owned} className="flex h-full flex-col">
        <CardHeader className="gap-2 pb-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="truncate">{card.cinema}</CardTitle>
              <p className="truncate text-sm text-ink-soft">{card.location}</p>
            </div>
            {card.owned && <Badge variant="solid" className="shrink-0">OWNED</Badge>}
          </div>

          <p className="line-clamp-1 text-sm font-medium text-ink">{card.movie}</p>

          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <Badge variant="brand">{card.format}</Badge>
            {card.language && <Badge variant="outline">{card.language}</Badge>}
            {ago && (
              <Badge
                variant={stale ? 'warn' : 'default'}
                title={`Last scraped ${formatTimestamp(card.scrapedAt)}`}
              >
                <Clock size={10} aria-hidden="true" />
                {ago}
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 gap-3 pt-0">
          {card.showtimes.length > 0 && (
            <div
              role="group"
              aria-label={`Showtimes at ${card.cinema}`}
              className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto"
            >
              {/* Real buttons: focusable and keyboard-operable, unlike the
                  clickable <div> badges these replace. */}
              {card.showtimes.map((time) => (
                <Chip key={time} selected={time === showtime} onClick={() => setShowtime(time)}>
                  {time}
                </Chip>
              ))}
            </div>
          )}

          <div className="h-px bg-line" />

          <div className="flex flex-1 flex-col">
            <p className="label-micro mb-1.5">
              Seat pricing{showtime ? ` · ${showtime}` : ''}
            </p>
            {tiers.length > 0 ? (
              <div className="flex flex-col">
                {tiers.map((tier, index) => (
                  <PriceRow key={`${tier.category}-${index}`} tier={tier} owned={card.owned} />
                ))}
              </div>
            ) : (
              <p className="py-2 text-sm text-ink-muted">No pricing available.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
