function togglePassword() {
  const input = document.getElementById('password');
  const icon = document.getElementById('eye-icon');

  const isHidden = input.type === 'password';
  input.type = isHidden ? 'text' : 'password';

  icon.innerHTML = isHidden
    ? `<path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
       <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
       <line x1="1" y1="1" x2="23" y2="23"/>`
    : `<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
       <circle cx="12" cy="12" r="3"/>`;
}

document.getElementById('loginForm').addEventListener('submit', async function (e) {
  e.preventDefault();

  const btn = document.getElementById('submitBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');
  const errorMsg = document.getElementById('error-msg');
  const errorText = document.getElementById('error-text');

  // Loading state
  btn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  errorMsg.classList.add('hidden');

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (res.ok && data.success) {
      window.location.href = '/dashboard';
    } else {
      errorText.textContent = data.message || 'E-mail ou senha inválidos.';
      errorMsg.classList.remove('hidden');
    }
  } catch (err) {
    errorText.textContent = 'Erro de conexão. Tente novamente.';
    errorMsg.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
});
