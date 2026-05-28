export function isValidCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(d[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(d[9])) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(d[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(d[10]);
}

export function isValidCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;

  const calc = (digits: string, weights: number[]) =>
    digits.split('').reduce((s, c, i) => s + parseInt(c) * weights[i], 0);

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const r1 = calc(d.slice(0, 12), w1) % 11;
  const d1 = r1 < 2 ? 0 : 11 - r1;
  const r2 = calc(d.slice(0, 13), w2) % 11;
  const d2 = r2 < 2 ? 0 : 11 - r2;

  return parseInt(d[12]) === d1 && parseInt(d[13]) === d2;
}

export function isValidPhone(phone: string): boolean {
  const d = phone.replace(/\D/g, '');
  return d.length === 10 || d.length === 11;
}

export function isValidCEP(cep: string): boolean {
  return /^\d{8}$/.test(cep.replace(/\D/g, ''));
}
