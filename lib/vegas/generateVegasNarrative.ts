export function pitchAngleForCategory(category: string): string {
  if (category === "expos" || category === "conferences") {
    return "Business-heavy demand window; lead with continuity and group-volume readiness.";
  }
  if (category === "concerts" || category === "festivals") {
    return "Pre/post-event throughput pressure; protect late-night volume before it gets chaotic.";
  }
  if (category === "sports") {
    return "Game-day surge profile; sell fryer uptime and high-turn menu protection.";
  }
  if (category === "performing-arts") {
    return "Pre-show reservation flow; timing discipline beats panic fixes.";
  }
  return "General event-timing play: procurement certainty plus service continuity.";
}
