'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { Save, User, Palette } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { usersApi } from '@/lib/api'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { PageHeader } from '@/components/ui/PageHeader'

import type { User as AppUser } from '@/types'
import { Eye, EyeOff, Lock } from 'lucide-react'
import { cn } from '@/lib/utils'

type ProfileForm = {
  firstName: string
  lastName: string
  email: string
}

function ProfileSettings({ user, onSaved }: { user: AppUser; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<ProfileForm>({
    firstName: user.firstName ?? '',
    lastName: user.lastName ?? '',
    email: user.email ?? '',
  })

  const { mutate: updateProfile, isPending } = useMutation({
    mutationFn: (data: ProfileForm) => usersApi.updateMe(data),
    onSuccess: async () => {
      toast.success('Profile updated')
      await onSaved()
    },
    onError: () => toast.error('Update failed'),
  })

  const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--lux-primary-soft)] text-[var(--lux-primary-muted)]">
            <User size={16} />
          </span>
          <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">Profile settings</h3>
        </div>
      </CardHeader>
      <CardBody className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar firstName={user.firstName} lastName={user.lastName} name={fullName} size="xl" />
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-[var(--lux-text-strong)]">
              {fullName || user.email}
            </p>
            <p className="truncate text-xs font-medium text-[var(--lux-muted-soft)]">{user.email}</p>
            <div className="mt-2">
              <StatusBadge status={user.role} />
            </div>
          </div>
        </div>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            updateProfile(form)
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              id="settings-first-name"
              label="First name"
              value={form.firstName}
              onChange={(e) => setForm((current) => ({ ...current, firstName: e.target.value }))}
            />
            <Input
              id="settings-last-name"
              label="Last name"
              value={form.lastName}
              onChange={(e) => setForm((current) => ({ ...current, lastName: e.target.value }))}
            />
          </div>
          <Input
            id="settings-email"
            label="Email address"
            type="email"
            value={form.email}
            onChange={(e) => setForm((current) => ({ ...current, email: e.target.value }))}
          />
          <div className="flex justify-end pt-1">
            <Button type="submit" loading={isPending}>
              <Save size={15} />
              Save profile
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

function PasswordSettings() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')

  const { mutate: updatePassword, isPending } = useMutation({
    mutationFn: (newPassword: string) =>
      usersApi.updateMe({ password: newPassword }),

    onSuccess: () => {
      toast.success('Password updated successfully')
      setPassword('')
      setConfirmPassword('')
      setError('')
    },

    onError: () => {
      toast.error('Failed to update password')
    },
  })

  const validatePassword = (value: string) => {
    if (value.length < 8) {
      return 'Password must be at least 8 characters'
    }

    if (!/(?=.*[A-Z])/.test(value)) {
      return 'Password must contain at least one uppercase letter'
    }

    if (!/(?=.*\d)/.test(value)) {
      return 'Password must contain at least one number'
    }

    return ''
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    const validationError = validatePassword(password)

    if (validationError) {
      setError(validationError)
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    updatePassword(password)
  }

  const pwStrength =
    !password.length
      ? 0
      : password.length < 6
        ? 1
        : password.length < 10
          ? 2
          : 3

  const strengthMap = [
    null,
    { label: 'Weak', cls: 'bg-red-500' },
    { label: 'Fair', cls: 'bg-amber-500' },
    { label: 'Strong', cls: 'bg-emerald-500' },
  ]

  return (
    <Card variant="glass">
      <CardHeader>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--lux-violet-soft)] text-[var(--lux-violet)]">
            <Lock size={16} />
          </span>
          <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">
            Security & Authentication
          </h3>
        </div>
      </CardHeader>

      <CardBody>
        <form className="space-y-4 max-w-md" onSubmit={handleSubmit}>
          {error && (
            <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-400">
              {error}
            </div>
          )}

          {/* PASSWORD */}
          <div className="space-y-2">
            <Input
              id="settings-password"
              label="New password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters with uppercase and number"
              autoComplete="new-password"
              icon={<Lock size={14} />}
              iconRight={
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-0.5 text-[var(--lux-muted-soft)] transition-colors hover:text-[var(--lux-text-strong)]"
                  aria-label={
                    showPassword ? 'Hide password' : 'Show password'
                  }
                >
                  {showPassword ? (
                    <EyeOff size={15} />
                  ) : (
                    <Eye size={15} />
                  )}
                </button>
              }
            />

            {password.length > 0 && (
              <div className="flex items-center gap-2.5 pt-1">
                <div className="flex flex-1 gap-1.5">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        'h-1.5 flex-1 rounded-full transition-all duration-300',
                        i <= pwStrength
                          ? strengthMap[pwStrength]!.cls
                          : 'bg-[var(--lux-line)]'
                      )}
                    />
                  ))}
                </div>

                <span className="w-12 text-right text-[11px] font-bold text-[var(--lux-muted-soft)]">
                  {strengthMap[pwStrength]?.label}
                </span>
              </div>
            )}
          </div>

          {/* CONFIRM PASSWORD */}
          <Input
            id="settings-confirm-password"
            label="Confirm new password"
            type={showConfirmPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            icon={<Lock size={14} />}
            iconRight={
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="p-0.5 text-[var(--lux-muted-soft)] transition-colors hover:text-[var(--lux-text-strong)]"
                aria-label={
                  showConfirmPassword ? 'Hide password' : 'Show password'
                }
              >
                {showConfirmPassword ? (
                  <EyeOff size={15} />
                ) : (
                  <Eye size={15} />
                )}
              </button>
            }
          />

          <div className="flex justify-end pt-1">
            <Button
              type="submit"
              loading={isPending}
              disabled={!password || !confirmPassword}
            >
              <Save size={15} />
              Update password
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  )
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth()

  return (
    <div className="max-w-3xl space-y-6 fade-up">
      <PageHeader
        eyebrow="Preferences"
        title="Settings"
        description="Manage your user profile details, security credentials, and workspace theme."
      />

      {user && (
        <ProfileSettings
          key={`${user.id}:${user.updatedAt ?? ''}:${user.email}`}
          user={user}
          onSaved={refreshUser}
        />
      )}

      <PasswordSettings />

      <Card variant="glass">
        <CardHeader>
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--lux-gold-soft)] text-[var(--lux-gold)]">
              <Palette size={16} />
            </span>
            <h3 className="text-sm font-bold text-[var(--lux-text-strong)]">Theme & Appearance</h3>
          </div>
        </CardHeader>
        <CardBody className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-[var(--lux-text-strong)]">Appearance Theme</p>
            <p className="text-xs font-medium text-[var(--lux-muted-soft)]">Switch between sleek dark mode and crisp light mode</p>
          </div>
          <ThemeToggle />
        </CardBody>
      </Card>
    </div>
  )
}

