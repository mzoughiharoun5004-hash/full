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
import { useTranslation } from '@/context/LanguageContext'
import { AuthShell } from '@/components/auth/AuthShell'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export default function LoginPage() {
  const router = useRouter()
  const { login } = useAuth()
  const { t } = useTranslation()
  const [showPass, setShowPass] = useState(false)
  const [serverError, setServerError] = useState('')

  const schema = z.object({
    email: z.string().email(t('auth_login_email')),
    password: z.string().min(6, t('settings_password_too_short')),
  })
  type FormData = z.infer<typeof schema>

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError('')
    try {
      await login(data.email, data.password)
      toast.success(t('auth_login_success'))
      router.push('/dashboard')
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : t('auth_login_failed')
      setServerError(message)
      toast.error(message)
    }
  }

  return (
    <AuthShell
      title={t('auth_login_title')}
      description={t('auth_login_description')}
      footer={
        <p>
          {t('auth_login_no_account')}{' '}
          <Link
            href="/auth/register"
            className="font-semibold text-[var(--lux-primary-muted)] transition-colors hover:text-[var(--lux-text)]"
          >
            {t('auth_login_create')}
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
          label={t('auth_login_email')}
          type="email"
          placeholder={t('auth_login_email_placeholder')}
          icon={<Mail size={14} />}
          error={errors.email?.message}
          autoComplete="email"
          {...register('email')}
        />

        <Input
          id="password"
          label={t('auth_login_password')}
          type={showPass ? 'text' : 'password'}
          placeholder={t('auth_login_password_placeholder')}
          icon={<Lock size={14} />}
          error={errors.password?.message}
          autoComplete="current-password"
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

        <Button type="submit" size="lg" loading={isSubmitting} className="w-full">
          {t('auth_login_submit')}
        </Button>
      </form>
    </AuthShell>
  )
}
