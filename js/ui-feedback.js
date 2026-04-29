export function retryHTML(msg, fn) {
  return `<p style="color:var(--rust)">${msg} <button onclick="${fn}()" style="background:none;border:none;color:var(--rust);text-decoration:underline;cursor:pointer;">Prøv igen</button></p>`;
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}
