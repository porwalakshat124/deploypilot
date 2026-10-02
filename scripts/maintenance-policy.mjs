const DAY = 86400000;
const digest = /^[a-f0-9]{64}$/;
const deploymentTag = /^deploypilot-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}:latest$/;

export function offsiteCandidates(groups, protectedHashes, now = Date.now()) {
  if (!protectedHashes.length || protectedHashes.some(hash => !digest.test(hash))) throw new Error('A locally restore-tested backup is required before offsite expiration');
  const complete = groups.filter(group => digest.test(group.hash) && group.database && group.secret && Number.isFinite(group.modifiedAt));
  const keep = new Set([...protectedHashes, ...complete.toSorted((a,b) => b.modifiedAt-a.modifiedAt).slice(0,7).map(group => group.hash)]);
  return complete.filter(group => !keep.has(group.hash) && group.modifiedAt < now - 90*DAY);
}

export function imageCandidates(images, referencedIds, protectedTags, now = Date.now()) {
  const ids = new Set(referencedIds), tags = new Set(protectedTags);
  return images.filter(image => /^sha256:[a-f0-9]{64}$/.test(image.id) && Number.isFinite(image.createdAt) && image.createdAt < now-90*DAY && !ids.has(image.id) && image.tags.length > 0 && image.tags.every(tag => deploymentTag.test(tag) && !tags.has(tag)));
}
