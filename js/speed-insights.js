/**
 * Vercel Speed Insights initialization
 * This script injects Vercel Speed Insights to track web vitals and performance metrics
 * 
 * Note: This uses ES modules via CDN for browser compatibility
 */
import { injectSpeedInsights } from 'https://cdn.jsdelivr.net/npm/@vercel/speed-insights@2/+esm';

// Initialize Speed Insights
// This will automatically track web vitals and performance metrics
injectSpeedInsights({
  debug: false, // Set to true to see events in console during development
});
