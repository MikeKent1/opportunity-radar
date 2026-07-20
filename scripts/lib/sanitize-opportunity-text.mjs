export function removeRelativeDeadlineText(value) {
  return String(value ?? '')
    .replace(
      /\b(?:ends?|ending|expires?|expiring|closes?|closing|deadline|valid|available)?\s*(?:in|within)?\s*\d{1,3}\s*(?:d|day|days|hr|hrs|hour|hours|h)\s*(?:left|remaining|to go|until close|until closing|until end|until it ends)?\b/gi,
      ' ',
    )
    .replace(
      /\b\d{1,3}\s*(?:d|day|days|hr|hrs|hour|hours|h)\s*(?:left|remaining|to go)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:ends?|ending|expires?|expiring|closes?|closing|deadline)\s*(?:soon|today|tomorrow|tonight|this week|next week)\b/gi,
      ' ',
    )
    .replace(/\b(?:last chance|hurry|limited time|almost over)\b/gi, ' ')
    .replace(/\s*-\s*-\s*/g, ' - ')
    .replace(/(?:^|\s)[-–—]\s*(?=[,.;:]|$)/g, ' ')
    .replace(/\s+[-–—]\s*$/g, ' ')
    .replace(/,\s*,/g, ',')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
