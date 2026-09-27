// Analytics (spec §4, task 6.2). This barrel is the pure, client-safe API: the metric rules and
// the response type the Analytics page renders. The server-only loader is './service'
// (repAnalytics), served by GET /api/rep/analytics.
export * from './metrics';
