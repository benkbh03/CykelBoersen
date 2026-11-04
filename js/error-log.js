/* Flyttet til error-log-v2.js (4. nov. 2026). Den gamle fil brugte et
   regulært udtryk som Safari før iOS 16.4 ikke kan læse, så hele siden
   stoppede. Filen her videresender kun, så en browser med en gammel main.js
   i cachen stadig virker. Kan slettes efter et par uger. */
export * from './error-log-v2.js';
