export type ISODateString = string

export type BuildingStatus = 'active' | 'completed'

export type TagType = 'anchor' | 'cleaning' | 'issue'

export type AnchorStatus = 'beforeCheck' | 'passedCheck' | 'failedCheck'
export type CleaningStatus = 'beforeCleaning' | 'afterCleaning'

export type TagStatus = AnchorStatus | CleaningStatus | 'none'

export type TagPhotoKind = 'general' | 'before' | 'after'

export type TagPhoto = {
  id: string
  createdAt: ISODateString
  dataUrl: string
  kind: TagPhotoKind
}

export type TagComment = {
  id: string
  createdAt: ISODateString
  text: string
}

export type Tag = {
  id: string
  createdAt: ISODateString
  seq: number
  type: TagType
  name?: string
  x: number
  y: number
  status: TagStatus
  photos: TagPhoto[]
  comments: TagComment[]
}

export type Building = {
  id: string
  createdAt: ISODateString
  completedAt?: ISODateString
  name: string
  location?: string
  status: BuildingStatus
  mainPhotoDataUrl: string
  tags: Tag[]
}

