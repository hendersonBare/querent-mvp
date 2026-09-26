// Margin floors (spec §5.2). This barrel is the pure, client-safe API: margin, floor resolution,
// the below-floor check and the warning text. It never touches the database, so the rep
// portal can import it in the browser. Server code that needs stored floors imports
// '@/server/floors/service' (quoteFloors, effectiveFloor, setMyFloor).
export * from './rules';
