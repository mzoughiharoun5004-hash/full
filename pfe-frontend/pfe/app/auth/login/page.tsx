'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Mail, Lock, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const [showPass, setShowPass] = useState(false)
  const [serverError, setServerError] = useState('')

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError('')

    try {
      await login(data.email, data.password)
      toast.success('Logged in')
      router.push('/dashboard')
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Unable to log in. Please try again.'
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      description="Log in to continue building and reviewing learning scenarios."
      footer={
        <p>
          {"Don't have an account? "}
          <Link
            href="/auth/register"
            className="font-semibold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text)]"
          >
            Create an account
          </Link>
        </p>
      }
    >
          {serverError && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-red-500/20 bg-red-500/8 px-4 py-3 text-sm text-red-300"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
            <Input
              id="email"
              label="Email address"
              type="email"
              placeholder="you@institution.edu"
              icon={<Mail size={14} />}
              error={errors.email?.message}
              autoComplete="email"
              {...register('email')}
            />

            <Input
              id="password"
              label="Password"
              type={showPass ? 'text' : 'password'}
              placeholder="Your password"
              icon={<Lock size={14} />}
              error={errors.password?.message}
              autoComplete="current-password"
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPass(v => !v)}
                  className="p-0.5 text-[var(--lux-muted-soft)] transition-colors hover:text-[var(--lux-text)]"
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              }
              {...register('password')}
            />

            <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
              Log in
            </Button>
          </form>
    </AuthShell>
  )
}
