import { CanActivate, ExecutionContext, INestApplication, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import * as crypto from 'crypto'
import { Request } from 'express'

import { IS_PUBLIC_KEY } from './auth.decorators'

@Injectable()
export class TokenGuard implements CanActivate {
	private reflector: Reflector

	constructor(
		app: INestApplication,
		private apiToken: string,
	) {
		this.reflector = app.get(Reflector)
	}

	canActivate(context: ExecutionContext): boolean {
		const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(), context.getClass()])
		if (isPublic) return true

		const request = context.switchToHttp().getRequest<Request>()
		const token = this.extractToken(request.headers.authorization)
		if (!token || !this.isValidToken(token)) {
			throw new UnauthorizedException()
		}
		return true
	}

	private extractToken(header: string | undefined): string | undefined {
		return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined
	}

	private isValidToken(token: string): boolean {
		const expected = Buffer.from(this.apiToken)
		const actual = Buffer.from(token)
		// timingSafeEqual throws on mismatched lengths instead of returning false
		if (expected.length !== actual.length) return false
		return crypto.timingSafeEqual(expected, actual)
	}
}
