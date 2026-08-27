import { GrayImage } from '../qrSample';

/**
 * Forty real QR payloads, and the tools to put them in front of a decoder.
 *
 * <p><b>Where these came from, and why it matters.</b> Every matrix below was produced by a
 * THIRD-PARTY encoder (`qrcode` on npm, run once at authoring time, outside this repository and
 * never a dependency of it). That is the whole point of the fixture: the decoder under test is
 * full of standard tables — error-correction block layouts, mask functions, the format code — and
 * a decoder checked against an encoder of its own author's making would agree with itself about
 * a mistyped table. These matrices are somebody else's reading of ISO/IEC 18004.</p>
 *
 * <p>The payloads are the ones the world actually prints: the app stores, a device sign-in page,
 * one-time-code enrolment and a Google Authenticator export, a café's wi-fi and menu and business
 * card, a SEPA transfer, a UPI payment, a poster campaign with its tracking parameters, a
 * calendar invitation, a boarding-pass-shaped number, Ukrainian and Japanese text, and a couple
 * of payloads long enough to need a big symbol. Between them they cover versions 2 to 18, all
 * four error-correction levels and every encoding mode this reader implements.</p>
 */
export interface QrFixture {
  /** What the payload is, in the words somebody would use for it. */
  readonly name: string;
  readonly version: number;
  readonly ec: string;
  readonly size: number;
  /** Exactly what the symbol carries — the assertion every test makes. */
  readonly text: string;
  /** The module matrix, row-major, one bit per module, base64. */
  readonly bits: string;
}

export const QR_CORPUS: readonly QrFixture[] = [
  {
    name: "apple app store",
    version: 4,
    ec: 'M',
    size: 33,
    text: "https://apps.apple.com/us/app/microsoft-authenticator/id983156458",
    bits: '/mw9P8E9t1BusU/Lt1+/ddut19LsFPxlB/qqqv4BBT0AvkfzvniQfdvtylKS0yUisfbuFCjGriP5HmjHE+XwWRjMekPCWOgzb5tv/Gm+0p8jm+JuHaXP5x3pJqqSMDUo9QicogFC/IBPSMV/l2Nq0F7V8eut4i/d16DGXuutu9EEYioc/q1j0QA=',
  },
  {
    name: "google play",
    version: 6,
    ec: 'M',
    size: 41,
    text: "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2&hl=en_US",
    bits: '/iL/a7/BBeI4UG6/u5Rrt1tghqXbqqf4uuwUzjfVB/qqqqr+AZA8ZwC+BFDlvkw0iKX93coTrCYargHBfad3Fb5RZwFLIb/Nu5K+a2lCTgoBWSuRS31SdpJcl996oKiHEhWCwxZpkTLDaQAtINSLaX9Ne6nimSlWGWbYfrhT9Aaa5u6BvkvkshY4FZBz5jqJ/N0k2HegIUXL7skD0WHRI4w5deG+11LX+oB3PqfG/5JTPWsQXD3pMSusiFoPpdfH+kKC61QhzekEzX5zkv6wc/1eAA==',
  },
  {
    name: "samsung galaxy store",
    version: 4,
    ec: 'L',
    size: 33,
    text: "https://galaxystore.samsung.com/detail/com.samsung.android.app.notes",
    bits: '/kCZv8FssRBunKdLt1rKVduio1LsFQlFB/qqqv4AEx4A++9T1SphfLHw9mKTVS4jwkP1RSTHi2TJD0qfuYRakS/04y5ASRwSTLL9z8KFQ6YDx0ilfTyU4WepLv+dGRVYF1msgw9S+IBRXkd/ttPrUEYQ8cup5y+V10f40uuPOp0FNkrs/qdDqQA=',
  },
  {
    name: "microsoft device sign-in",
    version: 4,
    ec: 'Q',
    size: 33,
    text: "https://microsoft.com/devicelogin",
    bits: '/p63P8Ew1hBugkPLt0kGtdupJOLsFUKNB/qqqv4AeD4Afy5TmPRQPJtvhfKyyJ2PPdw9+eXV7GcFDK1sKb2JOo3cS4zCWMI2bpvHgqsOxIsu++Y1AE3Wz9ZxFi7UT9Ugc7qejhZT+ABQjUV/ohjq0FfLMcuri+/V1VYuduoguNkFOYnc/gFgsQA=',
  },
  {
    name: "huawei appgallery",
    version: 3,
    ec: 'M',
    size: 29,
    text: "https://appgallery.huawei.com/app/C100307001",
    bits: '/lgb/BBaUG64QLt1T4XbqROuwXnFB/qqr+AaAQC+A0vlhW/8b6TpQcM5A694pwZkfD/FmIULjxQnkj9R0WQvVb1vslqpY5IJKuKd+4BKfH/4v2uQV6MRuptPtdRHS+67Yf0ETTOv7WcKAA==',
  },
  {
    name: "otpauth github",
    version: 5,
    ec: 'M',
    size: 37,
    text: "otpauth://totp/GitHub:me@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub",
    bits: '/gl02/wVm4tQbqenart1ULmV26aLwa7BJBElB/qqqq/gGlOHAILGOMZzK0JORYeYE+VXM2cGaFoz6Yn28if7mACe7SDDPoF8TU++G4Ff9QYjZaCTq1PUIsBgMTqoad86/14PibpYDx6aQD6HYT1Zq1HqOA4BZh+sJreRZf95dhNXGv9EJv8AZu78a/icb6qwTpy/G7oRgF+90eVssS6J++pDBOAHVF/q+QnKgA==',
  },
  {
    name: "otpauth microsoft",
    version: 9,
    ec: 'Q',
    size: 53,
    text: "otpauth://totp/Microsoft:me@outlook.com?secret=KRSXG5CTMVRXEZLUKRSXG5CT&issuer=Microsoft&algorithm=SHA1&digits=6&period=30",
    bits: '/jkJkjIj/BQd2R0PkG6M6WsdhLt1yqsQvdXbqORPgVIuwQRyx1DxB/qqqqqqr+AasNFSlwBercv9m87V4YyA+JPZL87KMBZ36WHH1Vl3Yt782ILSm7YAkCKbTpGXGDduTOf6Ly8/Oigyd5pBG/ivlW8ILkST+jUtnW9sI2liUioWhBMgcv/DjGdtQiC8a/Hyt4IJ3WxPj1nSssFMlMgmP6YH/dkf9UVK/G7/xxK53utTyqbRedcTA1GK/j1f6wv5YuvVYYK6fn2nmtbQ2FuqYbKU/md3NsI1k78xJR3Uu//8x6pRgJY3mdkuVUFSM6l13cIA6cUKDc3HYnLG3b9Fr3o67Qi8FTQqv0dd6sStBIoiWBJdVfg3yZ+cUtGiwE7wdsyMgSHOD92j+IByM8evDGf4dBa1CiqQXZ4xvEkWupr8/usfxdRs38asym6IuxcE3C8FxhZmtl9f4Mp6m/DUAA==',
  },
  {
    name: "otpauth aws sha256",
    version: 6,
    ec: 'M',
    size: 41,
    text: "otpauth://totp/AWS:ops@corp.io?secret=MFRGGZDFMZTWQ2LKNNWG23TP&issuer=AWS&algorithm=SHA256&digits=8&period=60",
    bits: '/uJ0ir/BUVo7EG6ksWoLt0y1E/XbqO+SkuwTTTyBB/qqqqr+AOgA4QCficEXS/wE+fnmS83zRTsBjGxcroRrU3eMFgSFdOvNTaGsHttYgRPT75YUmqIBOkQ6FSYhiJjem26NBXodjKwimIobx6duOBCorg0BINqVklqwgqEYUSb+B8scTYLQ/pRfTSn/al3EN1K8vF4t+OZK1zgvjYyP47y/qSXuBVab/oBLckrEv6LAWquQVTYdEQuuNb+v3dbnQ5Im6E79R2cEk/cE0f6LggGeAA==',
  },
  {
    name: "otpauth steam",
    version: 4,
    ec: 'L',
    size: 33,
    text: "otpauth://totp/Steam:trader?secret=GEZDGNBVGY3TQOJQGEZDGNBV&encoder=steam",
    bits: '/i6zv8FS1VBugofrt12SRdukF3LsFu1BB/qqqv4A5DwA+9Xi1QzWcqPSiXujx4HNzeHmg63ARBIrt/1n4U1K7K0sKreyyCx2M5DaiXw0wxXvuEPqmCTXIzZpDq71WiVLLvyXh10a+YBkF8Z/o3XrUEFesXut0g+F1qtS5uoX2JEF947s/pigxQA=',
  },
  {
    name: "google authenticator export, 3 accounts",
    version: 9,
    ec: 'L',
    size: 53,
    text: "otpauth-migration://offline?data=CioKCkhlbGxvId6tvu8SDm1lQGV4YW1wbGUuY29tGgZHaXRIdWIgASgBMAIKJgoMyv66vgARIjNEVWZ3EgtvcHNAY29ycC5pbxoDQVdTIAIoAjACCigKCqGyw9Tl9gARIjMSDmxlZ2FjeUBvbGQubmV0GgRCYW5rIAEoATABEAEYASAAKCo%3D",
    bits: '/pC5Fwyj/BM1UoMdkG6z0YJsJLt1CMGCfNXbr3OvhHYuwS72RB1RB/qqqqqqr+AN4tE5FQDyrYP+E5zvxWtekCOHetnbNPi4hWmlmgnORTYt1otVxnlEX5yML86z64gkdCqQcJtWOHIx6ubEU2jVBEsPaMjtCjosvP0ZTsOwSjPa+fx1xPTJ+cc/MMrDKKeMeOicio8P8yjXpQcogdySH4hV/V4PskSyTEo4xOa9dKqbyqexrgce1lEi+2zfmHH9UCbw1jSmspm48OWwYAcOELKSMGWnAoYSVNX9YYcgOCFUT4ejXyALJeuyShOgVK5w1gwVgLbOOJzkI4ksLJGTr5gOcCKhkOL7eosTIeODLRAghHdrBls3wRkh+IBQwyzGJGm64TLdf8Fd+4BECkdofHf4RX6nkWvQRZrxu6kSugEy/xo/pdQ8E4x43C6pEzfVKEUFXYMchmuv6IDGenK5AA==',
  },
  {
    name: "google authenticator export, 1 account",
    version: 7,
    ec: 'M',
    size: 45,
    text: "otpauth-migration://offline?data=CjcKFDEyMzQ1Njc4OTAxMjM0NTY3ODkwEhFhbGljZUBleGFtcGxlLmNvbRoGR29vZ2xlIAEoATACEAEYASAAKCo%3D",
    bits: '/kH2Vkv8E2U9CpBur6Q49Lt1WNoONduqD/jnrsFIpGUhB/qqqqqv4BbvH0YAvhI/8QviDWfeeOHb25kqWZwb1XGnEHOn1nhg5YJfymKO+4h4NligziE+kTN/N5cpZyAUqPay+OEF3+xgHgRBkSPp53b8ZvwA/aRgjHvMdKsm6odqxxrnH60cL+e/8w/S6yG69FJcvxKOPn0b/BMq7+C91MVQyrhEYe1EAJnKyfNxUTmZKpRvD/545UrZp0vidLECkNEYGwTyf3MRs3m2U/8Q/ABZNFeEX/gLq0Uq0F5/GeEeupgvtz+F1yQ29KluqsCKrpUE7BVjSc/tz3jwoQA=',
  },
  {
    name: "wi-fi wpa",
    version: 4,
    ec: 'M',
    size: 33,
    text: "WIFI:S:CoffeeHouse Guest;T:WPA;P:latte-2026!;H:false;;",
    bits: '/pmMv8F0hVBuonGLt0wEVdurcursE5PhB/qqqv4AYKwAn9Hry9aJzueL7t+iqqpeG12jbjbORCf1Wuzrjk34on2yIv5hAGZzyHbKpwC0dAwtfJHn4aTMSHfnDsznVPdTnQnc0luq+IBolcd/sU3qUFZB0VutBh+F1fCAYuii7jcEB0uW/po+hQA=',
  },
  {
    name: "wi-fi open, escaped name",
    version: 3,
    ec: 'L',
    size: 29,
    text: "WIFI:S:Bar\\;Grill\\:Wi-Fi;T:nopass;P:;;",
    bits: '/kyb/BTTUG6/jLt06aXbqGSuwWvVB/qqr+AZJwDTISuzKYicW7ga14gGINegmiQGvFj5/qV66438mNL365PoCVLjqVGCcyvZCTGz+AB+NFP7/2pQQ68eujNv3de1fO6d/2MFIrD/7M+gAA==',
  },
  {
    name: "café menu",
    version: 4,
    ec: 'M',
    size: 33,
    text: "https://menu.kavarnya.example/table/12?lang=uk",
    bits: '/mR1P8Eb51BusXnLt1pxZduv1hLsFb5BB/qqqv4BtkwAvj9DvkIFXNtlnkoa3pFwzdEjg0TGg/xtr9uoUeyjAT7sTxBaWObGbZtgm9C+0pevI+zwmfzEpjsptj2Oq51pxkqlihnD+YBaXkV/lWlq0FFy8cusAk/V1rx+ZupA1tEErTwU/p5b1QA=',
  },
  {
    name: "mecard business card",
    version: 6,
    ec: 'M',
    size: 41,
    text: "MECARD:N:Sydorenko,Olena;TEL:+380671234567;EMAIL:olena@kavarnya.example;URL:https://kavarnya.example;;",
    bits: '/pNKSL/BHGS0EG6NQVyrt1ce8VXbqrK8MuwVRDhhB/qqqqr+Af3HpQCL1xMK/LZINLSwi9J/jzSNJcY0BN6oCwrW9eXH042y79O4ninLPwF0haoqe8CxUAJD/eZvojQrc0AaPWpKR/4isL0F45TPny8JkaPNFmlWnqp1O8WToK9OVU0poRTFmQ0IWDfHBASesNnKQ/9ggpRUcEnL3BQ0EalzZSH7dWuv/oB4OIDGP7IviesQQMCrcfuuqYjv1dEN2weS6SdhzNcE7UahDv7pbhwWAA==',
  },
  {
    name: "vcard",
    version: 7,
    ec: 'L',
    size: 45,
    text: "BEGIN:VCARD\nVERSION:3.0\nN:Owen;Sean\nFN:Sean Owen\nORG:ZXing\nTEL;TYPE=CELL:+1-917-555-0143\nEMAIL:sean@example.com\nURL:https://example.com\nEND:VCARD",
    bits: '/siSx4v8EUTAAJBuocMvFLt1m+lENduvxf5nrsESHE3hB/qqqqqv4AzFGasA8t3v/yTvw6pMNossrkeFx7rRmbVkT8CzfqIcmUQ3Yic3XYxqxWqLTxFsY9GqhtQ0sZzvLSoAocGEq/XEWM9hu5oTDjv6YP8I+hRapHhUQCqs6wdqrxwrFzsej4gv5w/FIXGvSNbku20IjILoIr8w1nJ8uXvSIUbza1aq0eo53neV2ycpX2cFd5KWKhDYbkXG3N+C8CDHRTDwhiCIWEm4l/q0+wB3hGE0V/kz6hfrcE2jGgUWujMv96+l18SULQWuqIRIrMEFHAcZes/onD8KnQA=',
  },
  {
    name: "tip / payment link",
    version: 4,
    ec: 'M',
    size: 33,
    text: "https://pay.example.bank/qr/UA903052992990004149123456789",
    bits: '/um/P8FtZNBul4grt1AklduljnrsEGwZB/qqqv4BE+EAt11lJbYX/JsOrSvfPi8p8pf6Kf3RTVBJGa0J6rC6+kzEzyovajhzwZa32ssWrTwsaS41ST7sAj5XpG20bp7rBlKDsh7y+4BNy0Y/u51qEFMtMcuhTz+t1gaYsurXMtEERNPx/sB0LgA=',
  },
  {
    name: "sepa credit transfer (EPC069)",
    version: 6,
    ec: 'M',
    size: 41,
    text: "BCD\n002\n1\nSCT\nBANKUA22\nKavarnya Svitanok LLC\nUA903052992990004149123456789\nEUR12.50\n\n\nCoffee subscription\n",
    bits: '/rRi7r/Bap/2UG61ArJLt0FFBQXbqdjWcuwTcU41B/qqqqr+AAoH4wCf/lVqy/7ysRXFuv/TzSBAkJoQ4a5l+sWPa62Qh59xf3kYJ//5LG3WXc9JWdzB2MPNZi676UekfbY+3FbQ7+hpb7N4BhlFq3XbP9XrEOFysS+aSw2LxeJ4260U4x2flbzM4TuXJzvGID5JBTaujwiwezsSUrOzuZ9ysAfLlBv5+gBVykxHP6heziuQVJvUcYuuz9+f7dawAsRW6S7LeD8EelQiVf73gIWoAA==',
  },
  {
    name: "upi payment",
    version: 7,
    ec: 'Q',
    size: 45,
    text: "upi://pay?pa=cafe@okhdfcbank&pn=Filter%20Coffee&am=180.00&cu=INR&tn=Table%207",
    bits: '/lfarov8FRrCKJBumqYxlLt1K0bRtdus8fu7rsEapGoBB/qqqqqv4BRJH+8AXpPf3kbXZW2LN94QrPpsZWPKVp4PmXY+fia9PXIqjTl9ON8bCvPWAjO+5oquaz5dlbFMyHB28830goz2ICrK7CQKZWH+9v4A+ZRWfGJ0ceujKr/q/xKRFDMU38n/yK+HjbQqNpmd0lEzVlyTGutFQ9gqeBERXLp9m9V+1GqvG3EvOhRwW0PMc7+rGENXyhgR0R8C8Py5f3bwSsMLY1mxtfj7/AB19EVMW/gMK/KrEFMrHKcfurSvo8+V1s8gU5Eumu5ekysF/6gmXH/lhL/m/gA=',
  },
  {
    name: "bitcoin",
    version: 5,
    ec: 'M',
    size: 37,
    text: "bitcoin:bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq?amount=0.00042&label=Espresso",
    bits: '/ln5I/wRwibQbrONjrt1AoLV268p8q7BR4JJB/qqqq/gHuHiAL4mytvhIgjoCIi+cbTvelYOMzHg3ifuDh5OsIg+/6HLa4jQsNA2RVvf4CZuzUAdoAu03mPBKxiCpOSOup6+T5YpHieacvsRoeLwc4LaV+cMCe1IIpn6tocjUlg+Gak8Df6ARj2cW/kHOirwU7KREbrJIV/91K19Ne6pA71HBJEZWh/qz4ZPgA==',
  },
  {
    name: "poster campaign url",
    version: 7,
    ec: 'M',
    size: 45,
    text: "https://example.com/spring-sale?utm_source=poster&utm_medium=qr&utm_campaign=2026-spring&utm_content=metro-station-a",
    bits: '/h6SHkv8EyeNDJBuptxrNLt1N9yINduqlf37rsFq5FLhB/qqqqqv4BqjH5IAvm7f8QPlrNk2HMbvyIw7T9UQccO5n8B772x3ZLqDASsOlI37f5H4QRdOTdf3spCs1wQbJgaS0Ona+x/8DRWxvGL1aOj6r/9R+GxjxG9MfmpYqtGqjxEPE50e74s/50/SbV/6WCNMqOobOxxDoFOXpc7qPQBSLTovh2ONOpkpSNeEWwk38bpuBzsx8UDfqT66uLLC1sNcf3TzkHPfNemukPow+YBiREMMd/iY6oTq0F4PE1scuu+vgR/d1UEmWLfutFQ9H40E3pP/CM/t5DwhIQA=',
  },
  {
    name: "youtube short link",
    version: 4,
    ec: 'H',
    size: 33,
    text: "https://youtu.be/dQw4w9WgXcQ",
    bits: '/l7+v8EdNlBurXfrt1w6pduiztrsEDNpB/qqqv4A/bUAGxYwBg5OFy878S7d66jM8259a0uyIwAo2R92YlFjhCJtAsEYa0r2zXZj/LFZowtjdvqzTCxeAqJT4tw/aodbpMA3/49E+AB+XcU/rXPrkEkPEeupQ9+V1eMiuukbKi8EwmRH/kuwigA=',
  },
  {
    name: "instagram",
    version: 4,
    ec: 'M',
    size: 33,
    text: "https://www.instagram.com/kavarnya.svitanok/",
    bits: '/nTxP8EPpRBuvzort1Fz9dusFgrsFY5RB/qqqv4BlkoAvkfDvgAdX5tMvmsy1IBg4et9klzJ4Rx9HuzJwZ079T/0E5BT2MzFffvM6HCG2yKOK9C8CO3fq8spJgxHOWUKcgrMuqlL/YBEXsV/hOtq0FyT8duvQk/F1t56VuoQV9EEoTzc/rhztQA=',
  },
  {
    name: "telegram invite",
    version: 3,
    ec: 'M',
    size: 29,
    text: "https://t.me/+AAAAAEHbYQ0-abcdefghij",
    bits: '/sVL/BViUG6MaLt1hAXbpb8uwRoJB/qqr+AaDQC3RcJfJDR0WK0RjbkxOhc0JkYs1cEfflDk/5VQYnLaLdOj2Nul9csIWV/ZReZv/gBIVH/6iitQUcEZuiFPpdYu7m68tIsERwmv6yPFAA==',
  },
  {
    name: "whatsapp with message",
    version: 4,
    ec: 'L',
    size: 33,
    text: "https://wa.me/15551234567?text=I%20would%20like%20to%20book%20a%20table",
    bits: '/kHrP8FuOFBunE4rt1phtduizvLsFSuNB/qqqv4AE2kA++9OVSIgVJnQ1sR9RR4EskN9ZbpAp01ije8E3qXzmcnUOu/DuRjy/ormtglhSRKdIEsjKDGUq07KLh2RCxUpGWCcvsqX/IBA9cd/rpirUEq0MduptS+d131F0uogQRkFOkB0/ttfiQA=',
  },
  {
    name: "zoom meeting",
    version: 5,
    ec: 'M',
    size: 37,
    text: "https://us02web.zoom.us/j/89012345678?pwd=Q1dLZmpKWmc5RUlLbmNoUXJqMDlvZz09",
    bits: '/hUwk/wXX6+QbqYvBrt1m7+126JI1i7BNlExB/qqqq/gHbCqAIKAO95ygQJrQLuVEvG+a3PFLdckCeikxMx17q15GXl/RjF9fG3mOZJYvuqBQ0iblFuj2th48Vpe4RUXKHY+lZpZaCzQZw4JYQs5u6nh+ZemRjd+JuKS+L9AxtMUC6NAtv4AdLWMT/n6LypQQi8rEbp2lX+l0Ic3Eu6Y7G0bBLRzYd/qsHtygA==',
  },
  {
    name: "calendar event",
    version: 7,
    ec: 'M',
    size: 45,
    text: "BEGIN:VEVENT\nSUMMARY:Latte art class\nDTSTART:20260901T170000Z\nDTEND:20260901T190000Z\nLOCATION:Kavarnya Svitanok\nEND:VEVENT",
    bits: '/knqiAv8Fi8gzpBuiN4S5Lt04G/ZtduryfwnrsEULGbhB/qqqqqv4ARTHK0AqlOvpiiQBZTJiqoZ4MvOksQzHJeualf6bHKg4QwBZqoTKE0QWLoK8L5/hcogxm2fwCiI4Yjh/rk27piyjrzqxwahwnD8aP+q/oRi5Gs0SaoJa+6r2xU/GXkWv+tPnJ+gBCJp6sAf6XaifCJwUj2udHqlKCreQYSWau5Iaq+XBgjmnhseIL+a9xJJuCe+TEvqfeeCku06f37wTbxZqMmiBviv+QBn3F7EQ/j+apir0E4rHSMbusYPpq+903tZq1yutQCnoaME0jqqCL/srxzOboA=',
  },
  {
    name: "geo point",
    version: 3,
    ec: 'L',
    size: 29,
    text: "geo:50.4501,30.5234?q=Kyiv%20Maidan",
    bits: '/kHr/BbDUG6cort1oLXbovUuwVOVB/qqr+ABkAD76k1T6gfVWbZrLGLmNhB9FcaQF0ltiJ0XFgW1kPvLbWbgBbTvlmKhE6YtGSEG+gBHTH/7n+qQSaURustv9dYEau6maKUFJ3Mv7QAeAA==',
  },
  {
    name: "telephone",
    version: 2,
    ec: 'H',
    size: 25,
    text: "tel:+380441234567",
    bits: '/nI/wReQbqrrt1vF26OS7BJVB/qq/gB7ABsKhiBe3hvY4Ty06151JQym8FP7LFdjtWWGb/6AbEQ/peowRbE7r0+919KW6br3BIkn/iP4gA==',
  },
  {
    name: "sms with body",
    version: 2,
    ec: 'M',
    size: 25,
    text: "smsto:+15551234567:JOIN COFFEE",
    bits: '/h+/wVDQbo6rt06126wS7BNVB/qq/gB2AKpfCRYyTmTh42Am9Qk7GFAKqo7vAq66L6GerPiAbsV/nmtwTRGbqe/d0qo66imjBCwa/uphgA==',
  },
  {
    name: "plain email",
    version: 4,
    ec: 'M',
    size: 33,
    text: "mailto:sales@example.com?subject=Wholesale%20beans&body=Hello",
    bits: '/nT9P8EzolButIcrt1MKRdutC9rsF9s1B/qqqv4B1y8Avn5CviSmWzGst8IHzgiFv+IhNCSYZubNNGxNEBSoPzjOl8xCSagVfpjGgemDih3xycI5dy2VrzatBqxGME1ADyyeg+Pi+YBXbkb/lmFq0FdA8futMK/F10fG7urlHJEEOjzs/rbbgQA=',
  },
  {
    name: "ticket, numeric only",
    version: 2,
    ec: 'M',
    size: 25,
    text: "1234567890123456789012345678901234567890",
    bits: '/qu/wTcQbqTrt0pV26Dy7BTFB/qq/gDUAKNXEqpTsHaqcn0Zpjow1aqNTW+6PYw7dtP+Zv6AQ8Q/vCpwQLEbo9+100Ki6rxPBHXW/uYzgA==',
  },
  {
    name: "ticket, alphanumeric",
    version: 3,
    ec: 'Q',
    size: 29,
    text: "TICKET-2026-ABCD-1234 GATE B12 SEAT 14F",
    bits: '/gq7/BNskG6pZrt0e3XbrXWuwVFpB/qqr+AB0QBKjx2ljrWVz76hXfuK3+h33BZgzlQXus0wYhhv+ZpkOVZE1MaC7TG4IVwpziDe/ABsLHv4fuoQSQMWupKP1dKji66NxScFK7pv4m64AA==',
  },
  {
    name: "ukrainian text",
    version: 6,
    ec: 'M',
    size: 41,
    text: "Кав’ярня «Світанок» — знижка 20 % на каву до кінця тижня",
    bits: '/r8RTL/BFzmIkG6sbC5rt0fFWBXbokbVquwWTqyJB/qqqqr+AHuLrACjfVO1EsynGFcQ4KnDur/brSiIgErq3TdUOMPVG2dOSaXas/WKBIyvDO4It1VL5pZYt3wAgLu6J9SEdMhILr5XdbDd56Frxth9zas70Yk9zM8uzldl3uLSfheQEZSWWVClDggY8KjKb2PDuLmio1QSy238K5n4M4M3iEX77iM7+QBqJllEv77CP6uQRshIkRunLXPfjdKohbvG6uy7w0sE0MjvBP7r++V6gA==',
  },
  {
    name: "japanese text",
    version: 4,
    ec: 'M',
    size: 33,
    text: "コーヒー無料クーポン 2026年9月まで有効",
    bits: '/oFkv8EM85Buiyart1diNdup4ZrsF1cZB/qqqv4Bt1YAi4I8/KRnNLUWzhSJmKJeO8j045nd6sUGHT0aenpqVEDbY99uTcIg7N0ZnQ+2ixTiBF2yuc2eQ0PJeCmNwD4LVxZl8gDJ+IB+EUU/thZqkEBcMcuown+905TI8ujSRMEEMHbM/vUwZIA=',
  },
  {
    name: "gs1 digital link",
    version: 4,
    ec: 'M',
    size: 33,
    text: "https://id.gs1.org/01/09506000134376/10/ABC123?3103=000189",
    bits: '/l99v8FVntBumdtrt07fddupLqrsEy3lB/qqqv4Aju4AqhImCUja8HjrgoqMoiv+GSUkKqpObH/J9Hzm9ReAhZpaDqN15CRyknittzConZvhEyFqQZxSwGiJvvvotD6Tao4Pri6d+YBUs8Z/lQjqkEudsTuqOi/N0X1ocuuPHisEgejS/pmsbYA=',
  },
  {
    name: "google authenticator export, 10 accounts",
    version: 18,
    ec: 'L',
    size: 89,
    text: "otpauth-migration://offline?data=Ci0KCgEBAQEBAQEBAQESEXVzZXIwQGV4YW1wbGUuY29tGgZHaXRIdWIgASgBMAIKKgoKAgICAgICAgICAhIRdXNlcjFAZXhhbXBsZS5jb20aA0FXUyABKAEwAgotCgoDAwMDAwMDAwMDEhF1c2VyMkBleGFtcGxlLmNvbRoGR29vZ2xlIAEoATACCisKCgQEBAQEBAQEBAQSEXVzZXIzQGV4YW1wbGUuY29tGgRPa3RhIAEoATACCjEKCgUFBQUFBQUFBQUSEXVzZXI0QGV4YW1wbGUuY29tGgpDbG91ZGZsYXJlIAEoATACCi0KCgYGBgYGBgYGBgYSEXVzZXI1QGV4YW1wbGUuY29tGgZHaXRIdWIgASgBMAIKKgoKBwcHBwcHBwcHBxIRdXNlcjZAZXhhbXBsZS5jb20aA0FXUyABKAEwAgotCgoICAgICAgICAgIEhF1c2VyN0BleGFtcGxlLmNvbRoGR29vZ2xlIAEoATACCisKCgkJCQkJCQkJCQkSEXVzZXI4QGV4YW1wbGUuY29tGgRPa3RhIAEoATACCjEKCgoKCgoKCgoKCgoSEXVzZXI5QGV4YW1wbGUuY29tGgpDbG91ZGZsYXJlIAEoATACEAEYASAAKCo%3D",
    bits: '/tFa3K8aHlEEd7/BEky1XFTa8Y0CkG6xpt0LhJg+be8Lt1br6rFvqzoaMFXbrB8V+XwDf7K2UuwRLEDHcVbx/j1pB/qqqqqqqqqqqqr+ALXg0TMDHH3K+gDyoSyP5GwD7oRAztpVcEhrkyUDv+ZKX/LHXc5YiJMflaI9E8a2L35Yjgxj7LRjNdVyNiFN+N3m1OVaeGXqkO2YW4MMrB/5OBJxa4466a/ybz08wgR6ONuekQvTPGT5e1bVDcTxjqqihB5+rexZcJU22JoJMq2z54O4YDS2SCDKiuUQc8UUibVILPmdaYA6lIj2L5nMEgX0t22Kyj76anLCOgdgnbji+cN6Yl+BOMbgHVEFDp9pEMZCs0CpmCP8hV/bPTJaXyxm41WXc4THzrl1zF3ZTRJrdtSSVcLMnO+q+HrE+wiyvjDmX97G7cVGNCwxVFx8TmqYEytLEAr13Q62UXTQcbFHFH6y7xVvxa/PlrHH5Zkj/9rn7OjxByjkPhRIS4mIyYox4+2bzYIMlaQpRZ65Wi9pRAYtP+OkT0iwxn5KRuGT/WmWjT0A/cYHeEHxrgRzQQe8JF9oeyOC59Z0YEouKW+AmkHd6YQGIVdRbn2vyrsX4MRN68MrpTxmcKsPOgP4jQqPc3vEFv0Yc8+jQeFFYkobNxKIdeNlgFsTVc7AxUM8dF2dfDXeV2l1HqngndDuYKMR0dj4vYrREx0Tv2vqEcpvMtOoh+cuJSasyDO/ESqNMIFNirmlqVWXdSX0vfnMn1LHvvmiP6wulWNcx6X8mIvLiB7dTdJRL8xmLz4keX5mZD/VwR//sZ90USnXFH5D5xVKoCtKtphiqNNrr0RbGDR5p4USvzBHY/P4H+5+4/yTrf4CAUD1YX/71g4g7eKltQzmMmln2t5owgUWRICoRPJL47lFrb9XLlJhSJc89rJJ7epBSx75kNo/BteTFH/aIbByqdaAWu8ijYMONptYJs8SpvImM4eO/wn5pgi5ZyiGiPRyK9YqICz5DCXd78POsMTg6etNmglFiCi1Wlz8ShMWMmAznkGAibLKFrYNgdr8DpnzI1HWAX8jpiptJVPGCgPiT2zu2bbX0XqaRaZtXrCdPVXEUpfXcAXGVcrHDn+goijLKiKmFbn258oA1MlWTSaxO79d7krSkRNmEOHV03mjm5tUaLFOvv7D7FGTbW/PuhKD7BBO/gBvoPx0qyscSnVG/5oSaq4ZBa2fjeqQRTy5FZbURjxisRuiher8zWT/EApvzdZieeHWhiwMLQeC66RRhkRxp9u9+osFXSkBwx9iWtad8v7KAELd49FP9RXLAA==',
  },
  {
    name: "transport ticket, long numeric",
    version: 8,
    ec: 'M',
    size: 49,
    text: "999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999",
    bits: '/qnUbuy/wWomk+XQbrlLbQRrt0K/2oOl26vcvtFC7BF3sZ4xB/qqqqqq/gA2PHCBAJ+Be+aSS7J1Cu6qrpnIhOZoIJ6x/5848wKkZdUIRKjubTnp37l5XnSCizbY4+rZkMyGeZxNZhJuCEYwaw4WkoghmYAcE4Tijjhy58zfQWSnIJqioPjLPt1PtFPicZLkYRsaCrfGpDCoBGAnHzhHC+KG+yT+ThgmJuqsqGmnvhJJYmHZIwoa4V0mJAUoh6tsdiU/lgfJrz8sSgpgvO3dqrWyuUSm9ogohwp45YLudxSAHM1PjDlnr7kfDiSXYzTjJ2qLoq/iJPPobvsARV8a+8d/qmKogCpQVnrHCDHrq0N+aS+V1AC56q6m6A8Z5oZLBDd9EL45/s5BJERNgA==',
  },
  {
    name: "warranty payload, long byte",
    version: 16,
    ec: 'L',
    size: 81,
    text: "https://warranty.example.com/claim?token=A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8A1b2C3d4E5f6G7h8",
    bits: '/kdqUoigGWGIP8FLCmIjJtrW49BuhAI00awVkIert1NkgoNscVV51dujJu+xex+kIgLsFEAkY8I0c28pB/qqqqqqqqqqqv4AOwEdkV8RrBkA++uO+38U+i9HVW52cfGCHGywAyjIr4dVVpFvjfzihDdoh8mUmjMLnu1h4/HxFRvsmqFGZPNnEilmklnl/yjWKTRBBPldnnhSzovNKdBhsBjsvi0NES0xDkWhGKSOsLHiWqw4zn/S5pPvCtCpyNjmA4qogI6IFrszjPl35/mUsWPO1py3zuhDJuIqv510vbv03gikqoAdhFBiKcGFqhLn8bzNn6IN+Q4z+KOn+RRMoEem/kTgHkTqrI2qiIzrQNYqkREQMUo08d828ez7yv/ex8+ytO+zR8CEtoNkXxE/16o6/4bwbWY8Jd0oND3vqnjmYW0+u+8VIigB8kXCoOi+4HugviytgtMr6E6iz4iJI9ZEw4fZS/e3QWY+2ss7QxTmxHzqUrBPS0R2ccdUEIn0tL1SpMU8EOOwJWRSnJuvCvA2BW23P/eVuDog3k0kJXrxo2fM+BA5z0cEkgtkm8m9azLJVJxFmX2nE2pGuVO06W5l7nOuNplWacleVE0ADw10R61DUNkbtOi2Cc3C4JF3hXELhGuWD+X0/Bli/Cuv/TRKg8WI3MVhAkU2sS1rH5Wru3XryRFdEenW0QpFkUX6en+nsF+qdG/RhJdUGDGNw8AxkvvvEzFhEJi3yyGLvowsiUvjLLglT9achzlRhseqzBY0R2EOlP0pnov3swtzXhGhnfmegA0MptmdtxsBvssjyOERUwlkUizKIzAqHiWsw4jzvvu6uhBNAN0JigCrOwis6cMzcTOvgwnexUt3MO1qiwacNJlu0mn5lrvGuPWnClKvgdiFBJGYDJqJKp8R19w4RtyQ8SPCPmiUbaMLKmLpvgBrjciN3EiMzCINoCiJVMPEp02/877Ockke/Wh1+KsG+wBQVEcqNsTxB8X/spHqLgTqQdJrkEHg0cokkVcS0cuqzM+6wZ+0fC+V1yqJ9gttDsgsUuoAeg7w6tYtZ4EF/n8/K3p2++6s/v5W5kxGVsMqkwA=',
  },
  {
    name: "signed json payload",
    version: 5,
    ec: 'L',
    size: 37,
    text: "{\"v\":1,\"id\":\"a7f3c1\",\"exp\":1788000000,\"sig\":\"MEUCIQDq3Xk2Fb9pQm8YtLZ0nJ5RcV1wA7sT4uH6gK2mN8pQrIgB\"}",
    bits: '/vVt+/wQ62MQbpQHVrt0aR0V26Olcy7BKijlB/qqqq/gGSDAANpNdioLSR1VJbyLANnHUATutGL8c7V1IlfFeHotni4rtokgBRS6Gwlne2abVOGP4ktmVsFqIIWIoRsBPYrVQQTLvUANXCAji2uuVn8TYl9IJMKOPt7Cr5tR5kh9amTW1f8ATSCUU/j0gqswReFNErqB3p+F1RAdcO6B5/x/BUCx6X/rs3r8gA==',
  },
  {
    name: 'japanese text in shift-jis, no ECI header',
    version: 2,
    ec: 'M',
    size: 25,
    text: 'コーヒー無料クーポン',
    bits: '/um/wSZQbpUrt1c1269i7BddB/qq/gFNAIv//OqyaHzFUvKcdn9vYM8FU5wfemB7KFni7fiAU0R/uGpwSVFrrW/90UxO6X7NBGtq/ozZgA==',
  },
];

/** The packed bits back into a matrix. */
export function matrixOf(fixture: QrFixture): boolean[][] {
  const bytes = Buffer.from(fixture.bits, 'base64');
  const matrix: boolean[][] = [];
  for (let row = 0; row < fixture.size; row++) {
    const line: boolean[] = [];
    for (let column = 0; column < fixture.size; column++) {
      const index = row * fixture.size + column;
      line.push((bytes[index >> 3] & (0x80 >> (index & 7))) !== 0);
    }
    matrix.push(line);
  }
  return matrix;
}

export interface RenderOptions {
  /** Pixels per module. */
  readonly scale?: number;
  /** Quiet-zone modules on each side; the standard asks for four, screenshots often crop it. */
  readonly quiet?: number;
  /** Light modules on dark, as a dark-mode screenshot has them. */
  readonly invert?: boolean;
  /** Peak-to-peak brightness of the noise added to every pixel. */
  readonly noise?: number;
  /** Degrees, anticlockwise. */
  readonly rotate?: number;
  /** Box-blur radius in pixels. */
  readonly blur?: number;
}

/**
 * A matrix as a picture, the way one arrives on the clipboard.
 *
 * <p>This is the part of the test that is deliberately unkind: a real paste is a snip at some
 * arbitrary zoom, sometimes off-axis, sometimes from a dark theme, sometimes photographed off a
 * phone screen. Decoding a matrix proves the tables; decoding these proves the reader.</p>
 */
// eslint-disable-next-line complexity -- a fixture renderer: every branch is one optional way of making the picture harder to read
export function renderQr(matrix: readonly (readonly boolean[])[], options: RenderOptions = {}): GrayImage {
  const scale = options.scale ?? 4;
  const quiet = options.quiet ?? 4;
  const size = matrix.length;
  const side = (size + quiet * 2) * scale;
  const gray = new Uint8Array(side * side).fill(255);
  for (let row = 0; row < size; row++) {
    for (let column = 0; column < size; column++) {
      if (!matrix[row][column]) {
        continue;
      }
      for (let y = 0; y < scale; y++) {
        for (let x = 0; x < scale; x++) {
          gray[((quiet + row) * scale + y) * side + (quiet + column) * scale + x] = 0;
        }
      }
    }
  }
  let image: GrayImage = { gray, width: side, height: side };
  image = options.rotate === undefined || options.rotate === 0 ? image : rotated(image, options.rotate);
  image = options.blur === undefined || options.blur === 0 ? image : blurred(image, options.blur);
  image = options.noise === undefined || options.noise === 0 ? image : noisy(image, options.noise);
  return options.invert === true ? { ...image, gray: image.gray.map((value) => 255 - value) } : image;
}

// eslint-disable-next-line complexity -- bilinear resampling, whose only branch is the edge of the source picture
function rotated(image: GrayImage, degrees: number): GrayImage {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const side = Math.ceil(Math.abs(image.width * cos) + Math.abs(image.height * sin));
  const out = new Uint8Array(side * side).fill(255);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const dx = x - side / 2;
      const dy = y - side / 2;
      const sourceX = cos * dx + sin * dy + image.width / 2;
      const sourceY = -sin * dx + cos * dy + image.height / 2;
      const x0 = Math.floor(sourceX);
      const y0 = Math.floor(sourceY);
      if (x0 < 0 || y0 < 0 || x0 + 1 >= image.width || y0 + 1 >= image.height) {
        continue;
      }
      const fx = sourceX - x0;
      const fy = sourceY - y0;
      const at = (px: number, py: number): number => image.gray[py * image.width + px];
      out[y * side + x] =
        at(x0, y0) * (1 - fx) * (1 - fy) +
        at(x0 + 1, y0) * fx * (1 - fy) +
        at(x0, y0 + 1) * (1 - fx) * fy +
        at(x0 + 1, y0 + 1) * fx * fy;
    }
  }
  return { gray: out, width: side, height: side };
}

// eslint-disable-next-line complexity -- a box blur with its edge clamp
function blurred(image: GrayImage, radius: number): GrayImage {
  const out = new Uint8Array(image.gray.length);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < image.width && ny >= 0 && ny < image.height) {
            sum += image.gray[ny * image.width + nx];
            count++;
          }
        }
      }
      out[y * image.width + x] = sum / count;
    }
  }
  return { ...image, gray: out };
}

/** Deterministic noise — a test that fails one run in twenty is worse than no test. */
function noisy(image: GrayImage, amplitude: number): GrayImage {
  let seed = 20260827;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const out = new Uint8Array(image.gray.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(0, Math.min(255, image.gray[i] + (next() - 0.5) * amplitude));
  }
  return { ...image, gray: out };
}
