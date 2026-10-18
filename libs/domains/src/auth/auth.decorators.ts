import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'

/** Marks an endpoint as not requiring the shared API token - see `TokenGuard`. */
export const PublicEp = () => SetMetadata(IS_PUBLIC_KEY, true)
