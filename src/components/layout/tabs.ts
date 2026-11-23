import type { ComponentType, SVGProps } from 'react'
import { ChartIcon, DumbbellIcon, ForkKnifeIcon, HomeIcon, UserIcon } from '../icons/TabIcons'

export interface TabDef {
  path: string
  label: string
  Icon: ComponentType<SVGProps<SVGSVGElement>>
}

export const TABS: readonly TabDef[] = [
  { path: '/', label: 'Inicio', Icon: HomeIcon },
  { path: '/entrenar', label: 'Entrenar', Icon: DumbbellIcon },
  { path: '/comida', label: 'Comida', Icon: ForkKnifeIcon },
  { path: '/progreso', label: 'Progreso', Icon: ChartIcon },
  { path: '/perfil', label: 'Perfil', Icon: UserIcon },
]
