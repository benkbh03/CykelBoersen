export function updateNavAvatarUI({ safeAvatarUrl, getInitials }, name, avatarUrl) {
  const el = document.getElementById('nav-initials');
  if (!el) return;
  const safeUrl = safeAvatarUrl(avatarUrl);
  if (safeUrl) {
    el.innerHTML = `<img src="${safeUrl}" alt="" style="width:36px;height:36px;object-fit:cover;border-radius:50%;display:block;">`;
  } else {
    el.textContent = getInitials(name, '?');
  }
}
