interface JwtAlgorithms {
    [key: string]: SubtleCryptoImportKeyAlgorithm
}

enum JwtAlgorithm {
    ES256 = 'ES256',
    ES384 = 'ES384',
    ES512 = 'ES512',
    HS256 = 'HS256',
    HS384 = 'HS384',
    HS512 = 'HS512',
    RS256 = 'RS256',
    RS384 = 'RS384',
    RS512 = 'RS512'
}

interface JwtHeader {
    typ?: string,
    [key: string]: any
}

interface JwtPayload {
    iss?: string
    sub?: string
    aud?: string
    exp?: number
    nbf?: number
    iat?: number
    jti?: string
    [key: string]: any
}

/**
 * @typedef JwtOptions
 * @property {JwtAlgorithm} algorithm
 */
interface JwtOptions {
    algorithm: JwtAlgorithm
}

/**
 * @typedef JwtSignOptions
 * @property {JwtHeader} [header]
 */
interface JwtSignOptions extends JwtOptions {
    header?: JwtHeader
}

/**
 * @typedef JwtVerifyOptions
 * @property {boolean} [throwError]
 */
interface JwtVerifyOptions extends JwtOptions {
    throwError?: boolean
}

interface JwtData {
    header: JwtHeader | null
    payload: JwtPayload | null
}

/**
 * Base64URL
 * 
 * @class
 */
 class Base64URL {
    public static parse(s: string): Uint8Array {
        // @ts-ignore
        return new Uint8Array(Array.prototype.map.call(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '')), c => c.charCodeAt(0)))
        // return new Uint8Array(Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, ''))).map(c => c.charCodeAt(0)))
    }
    public static stringify(a: Uint8Array): string {
        // @ts-ignore
        return btoa(String.fromCharCode.apply(0, a)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
        // return btoa(String.fromCharCode.apply(0, Array.from(a))).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
    }
}

/**
 * Jwt
 *
 * @class
 * @constructor
 * @public
 */
class Jwt {

    protected algorithms: JwtAlgorithms = {
        ES256: { name: 'ECDSA', namedCurve: 'P-256', hash: { name: 'SHA-256' } },
        ES384: { name: 'ECDSA', namedCurve: 'P-384', hash: { name: 'SHA-384' } },
        ES512: { name: 'ECDSA', namedCurve: 'P-521', hash: { name: 'SHA-512' } },
        HS256: { name: 'HMAC', hash: { name: 'SHA-256' } },
        HS384: { name: 'HMAC', hash: { name: 'SHA-384' } },
        HS512: { name: 'HMAC', hash: { name: 'SHA-512' } },
        RS256: { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
        RS384: { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-384' } },
        RS512: { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-512' } }
    }

    constructor() {
        if (typeof crypto === 'undefined' || !crypto.subtle)
            throw new Error('SubtleCrypto not supported!')
    }

    protected _utf8ToUint8Array(str: string): Uint8Array {
        return Base64URL.parse(btoa(unescape(encodeURIComponent(str))))
    }

    protected _str2ab(str: string): ArrayBuffer {
        str = atob(str)
        const buf = new ArrayBuffer(str.length);
        const bufView = new Uint8Array(buf);
        for (let i = 0, strLen = str.length; i < strLen; i++) {
            bufView[i] = str.charCodeAt(i);
        }
        return buf;
    }

    protected _decodePayload(raw: string): any {
        switch (raw.length % 4) {
            case 0:
                break
            case 2:
                raw += '=='
                break
            case 3:
                raw += '='
                break
            default:
                throw new Error('Illegal base64url string!')
        }
        try {
            return JSON.parse(decodeURIComponent(escape(atob(raw))))
        } catch {
            return null
        }
    }

    /**
     * Signs a payload and returns the token
     * 
     * @param {JwtPayload} payload The payload object. To use `nbf` (Not Before) and/or `exp` (Expiration Time) add `nbf` and/or `exp` to the payload.
     * @param {string} secret A string which is used to sign the payload.
     * @param {JwtSignOptions | JwtAlgorithm} [options={ algorithm: 'HS256', header: { typ: 'JWT' } }] The options object or the algorithm.
     * @throws {Error} If there's a validation issue.
     * @returns {Promise<string>} Returns token as a `string`.
     */
    public async sign(payload: JwtPayload, secret: string, options: JwtSignOptions | JwtAlgorithm = { algorithm: JwtAlgorithm.HS256, header: { typ: 'JWT' } }): Promise<string> {
        if (typeof options === 'string')
            options = { algorithm: options, header: { typ: 'JWT' } }
        // @ts-ignore
        options = { algorithm: JwtAlgorithm.HS256, header: { typ: 'JWT' }, ...options }
        if (payload === null || typeof payload !== 'object')
            throw new Error('payload must be an object')
        if (typeof secret !== 'string')
            throw new Error('secret must be a string')
        if (typeof options.algorithm !== 'string')
            throw new Error('options.algorithm must be a string')
        const algorithm: SubtleCryptoImportKeyAlgorithm = this.algorithms[options.algorithm]
        if (!algorithm)
            throw new Error('algorithm not found')
        payload.iat = Math.floor(Date.now() / 1000)
        const payloadAsJSON = JSON.stringify(payload)
        const partialToken = `${Base64URL.stringify(this._utf8ToUint8Array(JSON.stringify({ ...options.header, alg: options.algorithm })))}.${Base64URL.stringify(this._utf8ToUint8Array(payloadAsJSON))}`
        let keyFormat = 'raw'
        let keyData
        if (secret.startsWith('-----BEGIN')) {
            keyFormat = 'pkcs8'
            keyData = this._str2ab(secret.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '').replace(/\s/g, ''))
        } else
            keyData = this._utf8ToUint8Array(secret)
        const key = await crypto.subtle.importKey(keyFormat, keyData, algorithm, false, ['sign'])
        const signature = await crypto.subtle.sign(algorithm, key, this._utf8ToUint8Array(partialToken))
        return `${partialToken}.${Base64URL.stringify(new Uint8Array(signature))}`
    }

    /**
     * Verifies the integrity of the token and returns a boolean value.
     * 
     * @param {string} token The token string generated by `jwt.sign()`.
     * @param {string} secret The string which was used to sign the payload.
     * @param {JWTVerifyOptions | JWTAlgorithm} options The options object or the algorithm.
     * @throws {Error | string} Throws an error `string` if the token is invalid or an `Error-Object` if there's a validation issue.
     * @returns {Promise<boolean>} Returns `true` if signature, `nbf` (if set) and `exp` (if set) are valid, otherwise returns `false`. 
     */
    async verify(token: string, secret: string, options: JwtVerifyOptions | JwtAlgorithm = { algorithm: JwtAlgorithm.ES256, throwError: false }): Promise<boolean> {
        if (typeof options === 'string')
            options = { algorithm: options, throwError: false }
        // @ts-ignore
        options = { algorithm: JwtAlgorithm.HS256, throwError: false, ...options }
        if (typeof token !== 'string')
            throw new Error('token must be a string')
        if (typeof secret !== 'string')
            throw new Error('secret must be a string')
        if (typeof options.algorithm !== 'string')
            throw new Error('options.algorithm must be a string')
        const tokenParts = token.split('.')
        if (tokenParts.length !== 3)
            throw new Error('token must consist of 3 parts')
        const algorithm: SubtleCryptoImportKeyAlgorithm = this.algorithms[options.algorithm]
        if (!algorithm)
            throw new Error('algorithm not found')
        const { payload } = this.decode(token)
        if (!payload) {
            if (options.throwError)
                throw 'PARSE_ERROR'
            return false
        }
        if (payload.nbf && payload.nbf > Math.floor(Date.now() / 1000)) {
            if (options.throwError)
                throw 'NOT_YET_VALID'
            return false
        }
        if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) {
            if (options.throwError)
                throw 'EXPIRED'
            return false
        }
        let keyFormat = 'raw'
        let keyData
        if (secret.startsWith('-----BEGIN')) {
            keyFormat = 'spki'
            keyData = this._str2ab(secret.replace(/-----BEGIN.*?-----/g, '').replace(/-----END.*?-----/g, '').replace(/\s/g, ''))
        } else
            keyData = this._utf8ToUint8Array(secret)
        const key = await crypto.subtle.importKey(keyFormat, keyData, algorithm, false, ['verify'])
        return await crypto.subtle.verify(algorithm, key, Base64URL.parse(tokenParts[2]), this._utf8ToUint8Array(`${tokenParts[0]}.${tokenParts[1]}`))
    }

    /**
     * Returns the payload **without** verifying the integrity of the token. Please use `jwt.verify()` first to keep your application secure!
     * 
     * @param {string} token The token string generated by `jwt.sign()`.
     * @returns {JwtData} Returns an `object` containing `header` and `payload`.
     */
    public decode(token: string): JwtData {
        return {
            header: this._decodePayload(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')),
            payload: this._decodePayload(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))
        }
    }
}

export default new Jwt