/* Farveklassen til standsmærket (.condition-tag i 02-listings.css). Delt
   mellem annoncekortene og forhåndsvisningen i salgsflowet, så sælgeren ser
   præcis det mærke køberen ser. */
export function conditionTagClass(condition) {
  if (condition === 'Ny')        return 'condition-tag--ny';
  if (condition === 'Som ny')    return 'condition-tag--som-ny';
  if (condition === 'God stand') return 'condition-tag--god';
  return 'condition-tag--brugt';
}
