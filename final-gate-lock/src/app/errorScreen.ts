/** Red boot error screen. The single exception to "no text on the play screen". */
export function showErrorScreen(title: string, errors: string[]): void {
  const el = document.createElement('div');
  el.className = 'error-screen';
  el.setAttribute('role', 'alert');
  el.dataset.testid = 'error-screen';
  const h = document.createElement('h1');
  h.textContent = title;
  const ul = document.createElement('ul');
  for (const e of errors) {
    const li = document.createElement('li');
    li.textContent = e;
    ul.appendChild(li);
  }
  el.append(h, ul);
  document.body.appendChild(el);
}
