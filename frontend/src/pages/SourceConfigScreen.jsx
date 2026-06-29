import React from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import { Card, CardContent } from '../components/ui/Card';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';

const sources = [
  { id: 1, name: 'BookMyShow (Mumbai)', url: 'in.bookmyshow.com/explore/movies-mumbai', parser: 'BMS_V2_STEALTH', status: 'ACTIVE', mode: 'Aggressive' },
  { id: 2, name: 'PVR Direct', url: 'pvrcinemas.com/movies/mumbai', parser: 'PVR_DIRECT_V1', status: 'ACTIVE', mode: 'Standard' },
  { id: 3, name: 'INOX Official', url: 'inoxmovies.com/mumbai', parser: 'INOX_NATIVE', status: 'ACTIVE', mode: 'Standard' },
  { id: 4, name: 'Cinepolis India', url: 'cinepoliscinemas.in', parser: 'CINEPOLIS_V3', status: 'ACTIVE', mode: 'Conservative' },
];

export function SourceConfigScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col"
    >
      <div className="mb-8">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-op-textMain">Ingestion Source Configs</h1>
        <p className="text-sm text-op-muted">Manage scraping targets, parser configurations and URL sources.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sources.map((source, idx) => (
          <motion.div 
            key={source.id} 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.05 }}
          >
            <Card className="flex flex-col justify-between h-full group">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-op-textMain mb-1">{source.name}</h3>
                    <a href={`https://${source.url}`} target="_blank" rel="noreferrer" className="text-sm text-op-link hover:underline">
                      {source.url}
                    </a>
                  </div>
                  <Badge variant="success">ACTIVE</Badge>
                </div>

                <div className="mt-8 grid grid-cols-3 gap-4 border-t border-op-border pt-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-op-muted">Mode</span>
                    <span className="text-sm font-medium text-op-textSecondary">{source.mode}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-op-muted">Parser</span>
                    <Badge variant="default" className="w-fit">{source.parser}</Badge>
                  </div>
                  <div className="flex items-end justify-end">
                    <Button size="sm" variant="primary" className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      <Play size={14} />
                      Run Test
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
