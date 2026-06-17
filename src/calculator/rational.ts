export class Rational {
  readonly num: bigint;
  readonly den: bigint;

  constructor(num: bigint | number, den: bigint | number = 1n) {
    const n = BigInt(num);
    const d = BigInt(den);
    if (d === 0n) throw new Error('Division by zero');
    const g = gcd(n < 0n ? -n : n, d < 0n ? -d : d);
    const sign = (n < 0n) !== (d < 0n) ? -1n : 1n;
    this.num = sign * (n / g);
    this.den = d / g;
    if (this.den < 0n) {
      this.num = -this.num;
      this.den = -this.den;
    }
  }

  static fromNumber(n: number): Rational {
    if (!Number.isFinite(n)) throw new Error('Invalid number');
    const str = n.toString();
    const dot = str.indexOf('.');
    if (dot === -1) return new Rational(BigInt(str), 1n);
    const den = 10n ** BigInt(str.length - dot - 1);
    const num = BigInt(str.replace('.', ''));
    return new Rational(num, den);
  }

  add(other: Rational): Rational {
    return new Rational(
      this.num * other.den + other.num * this.den,
      this.den * other.den,
    );
  }

  sub(other: Rational): Rational {
    return new Rational(
      this.num * other.den - other.num * this.den,
      this.den * other.den,
    );
  }

  mul(other: Rational): Rational {
    return new Rational(this.num * other.num, this.den * other.den);
  }

  div(other: Rational): Rational {
    return new Rational(this.num * other.den, this.den * other.num);
  }

  compare(other: Rational): number {
    const left = this.num * other.den;
    const right = other.num * this.den;
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  }

  toNumber(): number {
    return Number(this.num) / Number(this.den);
  }

  toString(): string {
    if (this.den === 1n) return this.num.toString();
    return `${this.num}/${this.den}`;
  }
}

function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a === 0n ? 1n : a;
}

export const R = {
  of: (n: number | bigint, d?: number | bigint) => new Rational(n, d ?? 1n),
  from: (n: number) => Rational.fromNumber(n),
  zero: new Rational(0n),
  one: new Rational(1n),
};
