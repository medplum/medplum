import { NextRequest, NextResponse } from 'next/server';
import { createUser } from '@/lib/users';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, email, password } = body;

  if (!name?.trim()) return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 });
  if (!email?.trim()) return NextResponse.json({ error: 'E-mail é obrigatório' }, { status: 400 });
  if (!password || password.length < 8) {
    return NextResponse.json({ error: 'Senha deve ter pelo menos 8 caracteres' }, { status: 400 });
  }

  try {
    const user = await createUser({ name: name.trim(), email: email.trim().toLowerCase(), password });
    return NextResponse.json({ id: user.id }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Erro ao criar conta';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
