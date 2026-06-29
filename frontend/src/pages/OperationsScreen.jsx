import React from 'react';
import { motion } from 'framer-motion';
import { Play, RotateCcw, CheckCircle2 } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';

const history = [
  { id: 'RUN-8923', start: '10:00:00 AM', end: '10:02:14 AM', mode: 'Cron', records: 428, status: 'Completed' },
  { id: 'RUN-8922', start: '09:00:00 AM', end: '09:02:08 AM', mode: 'Cron', records: 426, status: 'Completed' },
  { id: 'RUN-8921', start: '08:00:00 AM', end: '08:01:55 AM', mode: 'Cron', records: 426, status: 'Completed' },
  { id: 'RUN-8920', start: '07:34:12 AM', end: '07:35:40 AM', mode: 'Manual', records: 426, status: 'Completed' },
  { id: 'RUN-8919', start: '07:00:00 AM', end: '07:02:10 AM', mode: 'Cron', records: 426, status: 'Completed' },
];

export function OperationsScreen() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid h-[calc(100vh-120px)] grid-cols-1 gap-8 lg:grid-cols-2"
    >
      {/* Left Column: Actions */}
      <div className="flex flex-col gap-6">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-op-textMain">Operations</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Test Ingestion Engine</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-op-muted">
              Manually trigger a full run of all active scrapers in the queue. This will bypass the cron schedule and execute immediately.
            </p>
            <Button className="w-full bg-[#00D26A] text-black hover:bg-[#00D26A]/90 py-6 text-base font-semibold shadow-[0_0_15px_rgba(0,210,106,0.2)]">
              <Play className="mr-2" size={20} />
              Run Test Ingestion
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Base Structural Seed</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <p className="text-sm text-op-muted">
              Wipe current competitor mapping and re-seed from base configuration files. Use this only when structural drift is detected.
            </p>
            <Button variant="secondary" className="w-full py-6 text-base font-semibold">
              <RotateCcw className="mr-2" size={20} />
              Reset Base Setup Data
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right Column: Run History */}
      <div className="flex flex-col overflow-hidden">
        <h2 className="mb-6 text-lg font-semibold text-op-textMain">Run History</h2>
        
        <div className="flex-1 overflow-y-auto pr-4 space-y-4">
          {history.map((run, idx) => (
            <motion.div 
              key={run.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
            >
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-op-textMain">{run.id}</span>
                    <Badge variant="default">{run.mode}</Badge>
                  </div>
                  <Badge variant="success" className="flex items-center gap-1 bg-[#00D26A]/10 text-[#00D26A] border-[#00D26A]/20">
                    <CheckCircle2 size={12} />
                    {run.status}
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-op-muted">Start</span>
                    <span className="font-mono text-op-textSecondary">{run.start}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-op-muted">End</span>
                    <span className="font-mono text-op-textSecondary">{run.end}</span>
                  </div>
                  <div className="flex flex-col gap-1 text-right">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-op-muted">Records Written</span>
                    <span className="font-mono font-medium text-op-textMain">{run.records}</span>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
