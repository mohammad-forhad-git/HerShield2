import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { hashPassword, withSessionCookie } from "@/lib/auth";
import { fieldErrors, registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    return await handle(req);
  } catch (e) {
    console.error("[register]", e);
    return NextResponse.json(
      { error: "Server could not reach the database. Check that DATABASE_URL is set and the tables exist (npm run setup)." },
      { status: 500 },
    );
  }
}

async function handle(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please fix the highlighted fields.", fields: fieldErrors(parsed.error) }, { status: 422 });
  }
  const d = parsed.data;

  const [emailTaken, idTaken] = await Promise.all([
    prisma.user.findUnique({ where: { email: d.email } }),
    prisma.studentProfile.findUnique({ where: { studentId: d.studentId } }),
  ]);
  if (emailTaken || idTaken) {
    return NextResponse.json(
      {
        error: "An account already exists with these details.",
        fields: {
          ...(emailTaken ? { email: "This email is already registered" } : {}),
          ...(idTaken ? { studentId: "This student ID is already registered" } : {}),
        },
      },
      { status: 409 },
    );
  }

  const user = await prisma.user.create({
    data: {
      name: d.fullName,
      email: d.email,
      phone: d.phone,
      role: "STUDENT",
      passwordHash: await hashPassword(d.password),
      lastLoginAt: new Date(),
      studentProfile: { create: { studentId: d.studentId, department: d.department || null } },
    },
  });

  const res = NextResponse.json({ ok: true, redirect: "/student" }, { status: 201 });
  return withSessionCookie(res, { userId: user.id, role: "STUDENT", name: user.name, email: user.email });
}
