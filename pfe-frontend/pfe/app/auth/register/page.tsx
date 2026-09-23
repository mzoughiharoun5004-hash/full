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
import { useTranslation } from '@/context/LanguageContext'
import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cn } from '@/lib/utils'

export default function RegisterPage() {
  const router = useRouter()
  const { register: registerUser } = useAuth()
  const { t } = useTranslation()
  const [showPass, setShowPass] = useState(false)

  const schema = z.object({
    firstName: z.string().min(2, t('auth_register_first_name')),
    lastName: z.string().min(2, t('auth_register_last_name')),
    email: z.string().email(t('auth_login_email')),
    password: z.string()
      .min(8, t('settings_password_too_short'))
      .regex(/(?=.*[A-Z])(?=.*\d)/, { message: t('settings_password_no_uppercase') }),
  })
  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const password = useWatch({ control, name: 'password' }) ?? ''
  const pwStrength = !password.length ? 0 : password.length < 6 ? 1 : password.length < 10 ? 2 : 3
  const strengthMap = [
    null,
    { labelKey: 'settings_password_weak' as const, cls: 'bg-[#EF4444]' },
    { labelKey: 'settings_password_fair' as const, cls: 'bg-[#C6A765]' },
    { labelKey: 'settings_password_strong' as const, cls: 'bg-[#14B8A6]' },
  ]

  const onSubmit = async (data: FormData) => {
    try {
      await registerUser(data)
      toast.success(t('auth_register_success'))
      router.push('/dashboard')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth_register_failed')
      toast.error(message)
    }
  }

  return (
    <AuthShell
      title={t('auth_register_title')}
      description={t('auth_register_description')}
      footer={
        <p>
          {t('auth_register_has_account')}{' '}
          <Link
            href="/auth/login"
            className="font-semibold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text)]"
          >
            {t('auth_register_login')}
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            id="firstName"
            label={t('auth_register_first_name')}
            placeholder={t('auth_register_first_name_placeholder')}
            icon={<User size={13} />}
            error={errors.firstName?.message}
            autoComplete="given-name"
            {...register('firstName')}
          />
          <Input
            id="lastName"
            label={t('auth_register_last_name')}
            placeholder={t('auth_register_last_name_placeholder')}
            error={errors.lastName?.message}
            autoComplete="family-name"
            {...register('lastName')}
          />
        </div>

        <Input
          id="email"
          label={t('auth_register_email')}
          type="email"
          placeholder={t('auth_login_email_placeholder')}
          icon={<Mail size={14} />}
          error={errors.email?.message}
          autoComplete="email"
          {...register('email')}
        />

        <div className="space-y-2">
          <Input
            id="password"
            label={t('auth_register_password')}
            type={showPass ? 'text' : 'password'}
            placeholder={t('auth_register_password_placeholder')}
            icon={<Lock size={14} />}
            error={errors.password?.message}
            autoComplete="new-password"
            iconRight={
              <button
                type="button"
                onClick={() => setShowPass(v => !v)}
                className="p-0.5 text-[var(--lux-muted-soft)] transition-colors hover:text-[var(--lux-text)]"
                aria-label={showPass ? t('auth_hide_password') : t('auth_show_password')}
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
                {strengthMap[pwStrength] ? t(strengthMap[pwStrength]!.labelKey) : ''}
              </span>
            </div>
          )}
        </div>

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {t('auth_register_submit')}
        </Button>
      </form>
    </AuthShell>
  )
}
