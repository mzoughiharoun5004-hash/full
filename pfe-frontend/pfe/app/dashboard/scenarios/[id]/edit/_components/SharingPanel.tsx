'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import { UserPlus, Trash2, Search } from 'lucide-react'
import { scenariosApi, usersApi } from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useSocket } from '@/context/SocketContext'
import { Avatar } from '@/components/ui/Avatar'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import type { User, ScenarioShare } from '@/types'

interface Props { scenarioId: string }

export function SharingPanel({ scenarioId }: Props) {
  const qc = useQueryClient()
  const { user } = useAuth()
  const { broadcastScenarioEdit } = useSocket()
  const [searchEmail, setSearchEmail] = useState('')
  const trimmedEmail = searchEmail.trim()

  const { data: shares, isLoading } = useQuery<ScenarioShare[]>({
    queryKey: ['shares', scenarioId],
    queryFn: () => scenariosApi.getShares(scenarioId).then(r => r.data),
  })

  const { data: users = [] } = useQuery<User[]>({
    queryKey: ['user-search', trimmedEmail],
    queryFn: () => usersApi.search(trimmedEmail).then(r => r.data),
    enabled: trimmedEmail.length >= 2,
  })

  const { mutate: addShare, isPending } = useMutation({
    mutationFn: () => scenariosApi.share(scenarioId, {
      email: trimmedEmail,
    }),
    onSuccess: () => {
      toast.success('Collaborator added')
      qc.invalidateQueries({ queryKey: ['shares', scenarioId] })
      broadcastScenarioEdit({ scenarioId, entityType: 'scenario', action: 'update' })
      setSearchEmail('')
    },
    onError: () => toast.error('Failed to share'),
  })

  const { mutate: revokeShare } = useMutation({
    mutationFn: (shareId: string) => scenariosApi.revokeShare(scenarioId, shareId),
    onSuccess: () => {
      toast.success('Access revoked')
      qc.invalidateQueries({ queryKey: ['shares', scenarioId] })
      broadcastScenarioEdit({ scenarioId, entityType: 'scenario', action: 'update' })
    },
  })

  const filteredUsers = users.filter(u => u.id !== user?.id)

  return (
    <div className="p-5 space-y-5">
      <h3 className="text-sm font-semibold text-slate-200">Share Scenario</h3>

      <div className="space-y-3">
        <Input
          placeholder="Collaborator email..."
          icon={<Search size={14} />}
          value={searchEmail}
          onChange={e => setSearchEmail(e.target.value)}
          id="share-search"
        />

        {searchEmail && filteredUsers.length > 0 && (
          <div className="max-h-40 overflow-y-auto rounded-xl border border-white/10 bg-[#0d0f17] lux-scrollbar">
            {filteredUsers.map(u => (
              <button
                key={u.id}
                onClick={() => setSearchEmail(u.email)}
                className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-white/5 text-left transition-colors"
              >
                <Avatar firstName={u.firstName} lastName={u.lastName} size="xs" />
                <div>
                  <p className="text-xs font-medium text-slate-200">{u.firstName} {u.lastName}</p>
                  <p className="text-[10px] text-slate-500">{u.email}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        <Button size="sm" onClick={() => addShare()} loading={isPending} disabled={!trimmedEmail}>
          <UserPlus size={13} className="mr-1" /> Add collaborator
        </Button>
      </div>

      <div>
        <p className="text-xs font-medium text-slate-500 uppercase mb-2">People with access</p>
        {isLoading ? (
          <div className="flex justify-center py-4"><Spinner size="sm" /></div>
        ) : (
          <div className="space-y-2">
            {(shares ?? []).map(share => (
              <div key={share.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/4">
                <Avatar firstName={share.user?.firstName} lastName={share.user?.lastName} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-slate-200 truncate">{share.user?.firstName} {share.user?.lastName}</p>
                  <p className="text-[10px] text-slate-500 truncate">{share.user?.email}</p>
                </div>
                <Badge variant={share.role === 'CO_AUTHOR' ? 'purple' : 'info'} size="sm">
                  {share.role === 'CO_AUTHOR' ? 'Co-author' : 'Reviewer'}
                </Badge>
                <button onClick={() => revokeShare(share.id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
            {(!shares || shares.length === 0) && (
              <p className="text-xs text-slate-600 text-center py-4">Not shared with anyone</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
