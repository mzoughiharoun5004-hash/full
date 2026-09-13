'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'react-hot-toast'
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

const schema = z.object({
  firstName: z.string().min(2, 'Please enter your first name'),
  lastName: z.string().min(2, 'Please enter your last name'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Use at least 8 characters')
    .regex(/(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one uppercase letter and one number',
    }),
})
type FormData = z.infer<typeof schema>

export default function RegisterPage() {
  const router = useRouter()
  const { register: registerUser } = useAuth()
  const [showPass, setShowPass] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  })

  const password = useWatch({ control, name: 'password' }) ?? ''
  const pwStrength = !password.length ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const strengthMap = [
    null,
    { label: 'Weak', cls: 'bg-[#EF4444]' },
    { label: 'Fair', cls: 'bg-[#C6A765]' },
    { label: 'Strong', cls: 'bg-[#14B8A6]' },
  ]

  const onSubmit = async (data: FormData) => {
    try {
      await registerUser(data)
      toast.success('Account created')
      router.push('/dashboard')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Registration failed.'
      toast.error(message)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      description="Set up your workspace and start building structured learning scenarios."
      footer={
        <p>
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-semibold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text)]"
          >
            Log in
          </Link>
        </p>
      }
    >
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                id="firstName"
                label="First name"
                placeholder="Jane"
                icon={<User size={13} />}
                error={errors.firstName?.message}
                autoComplete="given-name"
                {...register('firstName')}
              />
              <Input
                id="lastName"
                label="Last name"
                placeholder="Doe"
                error={errors.lastName?.message}
                autoComplete="family-name"
                {...register('lastName')}
              />
            </div>

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

            <div className="space-y-2">
              <Input
                id="password"
                label="Password"
                type={showPass ? 'text' : 'password'}
                placeholder="At least 8 characters with uppercase letter and number"
                icon={<Lock size={14} />}
                error={errors.password?.message}
                autoComplete="new-password"
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

              {password.length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 gap-1">
                    {[1, 2, 3].map(i => (
                      <div
                        key={i}
                        className={cn(
                          'h-1 flex-1 rounded-full transition-all duration-300',
                          i <= pwStrength ? strengthMap[pwStrength]!.cls : 'bg-[var(--lux-line)]'
                        )}
                      />
                    ))}
                  </div>
                  <span className="w-10 text-right text-[11px] text-[var(--lux-muted-soft)]">
                    {strengthMap[pwStrength]?.label}
                  </span>
                </div>
              )}
            </div>

            <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
              Create account
            </Button>
          </form>
    </AuthShell>
  )
}
