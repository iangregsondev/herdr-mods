import { View, div, svg } from "gpui-kit";
import { Input, InputState, h_flex, v_flex } from "gpui-base";
import { appHome, closeOverlay, exec, focused, hc, home, layout, machines, nextCommand, notify, openOverlay, panes, pickFolder, props, readTextFile, run, setShared, settings, shared, spaces, theme, updates, writeTextFile } from "herdr";

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Pipeable.js
/**
* The `Pipeable` module defines the shared interface and implementation helpers
* for values that support Effect-style method chaining with `.pipe(...)`.
*
* A `Pipeable` value can pass itself through a sequence of unary functions from
* left to right, so code can be written as `value.pipe(f, g, h)` instead of
* deeply nesting calls. This is the method form used by many Effect data types
* to compose transformations, validations, and effectful operations while
* keeping the original value as the starting point of the pipeline.
*
* @stability stable
* @since 2.0.0
*/
/**
* Applies a `pipe` method's variadic arguments to an initial value from left
* to right.
*
* **When to use**
*
* Use to implement a custom `.pipe(...)` method from JavaScript's `arguments`
* object.
*
* **Details**
*
* This helper is intended for implementing `Pipeable.pipe` methods that
* receive JavaScript's `arguments` object. With no functions it returns the
* original value; otherwise it feeds each result into the next function.
*
* **Example** (Implementing a pipe method)
*
* ```ts import.meta.vitest
* import { Pipeable } from "effect"
*
* class NumberBox {
*   constructor(readonly value: number) {}
*
*   pipe(..._fns: ReadonlyArray<(value: number) => number>): number {
*     return Pipeable.pipeArguments(this.value, arguments) as number
*   }
* }
*
* const result = new NumberBox(5).pipe(
*   (n) => n + 2,
*   (n) => n * 3
* )
* result // => 21
* ```
*
* @stability stable
* @category combinators
* @since 2.0.0
*/
const pipeArguments = (self, args) => {
	switch (args.length) {
		case 0: return self;
		case 1: return args[0](self);
		case 2: return args[1](args[0](self));
		case 3: return args[2](args[1](args[0](self)));
		case 4: return args[3](args[2](args[1](args[0](self))));
		case 5: return args[4](args[3](args[2](args[1](args[0](self)))));
		case 6: return args[5](args[4](args[3](args[2](args[1](args[0](self))))));
		case 7: return args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))));
		case 8: return args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self))))))));
		case 9: return args[8](args[7](args[6](args[5](args[4](args[3](args[2](args[1](args[0](self)))))))));
		default: {
			let ret = self;
			for (let i = 0, len = args.length; i < len; i++) ret = args[i](ret);
			return ret;
		}
	}
};
/**
* Reusable prototype that implements `Pipeable.pipe`.
*
* **When to use**
*
* Use when classes or object prototypes can reuse this value when they need the
* standard pipe implementation backed by `pipeArguments`.
*
* @stability stable
* @category prototypes
* @since 3.15.0
*/
const Prototype$1 = { pipe() {
	return pipeArguments(this, arguments);
} };
/**
* Provides a base constructor whose instances implement the standard `Pipeable.pipe`
* method.
*
* **When to use**
*
* Use when you need to define a class that supports Effect-style method
* chaining through `.pipe(...)`.
*
* @stability stable
* @category constructors
* @since 3.15.0
*/
const Class$1 = /*#__PURE__*/ function() {
	function PipeableBase() {}
	PipeableBase.prototype = Prototype$1;
	return PipeableBase;
}();

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Function.js
/**
* Creates a function that can be called in data-first style or data-last
* (`pipe`-friendly) style.
*
* **When to use**
*
* Use to expose one implementation through both direct and `pipe`-friendly
* call styles.
*
* **Details**
*
* Pass either the arity of the uncurried function or a predicate that decides
* whether the current call is data-first. Arity is the common case. Use a
* predicate when optional arguments make arity ambiguous.
*
* **Example** (Selecting data-first or data-last style by arity)
*
* ```ts import.meta.vitest
* import { Function, pipe } from "effect"
*
* const sum = Function.dual<
*   (that: number) => (self: number) => number,
*   (self: number, that: number) => number
* >(2, (self, that) => self + that)
*
* sum(2, 3) // => 5
* pipe(2, sum(3)) // => 5
* ```
*
* **Example** (Defining overloads with call signatures)
*
* ```ts import.meta.vitest
* import { Function, pipe } from "effect"
*
* const sum: {
*   (that: number): (self: number) => number
*   (self: number, that: number): number
* } = Function.dual(2, (self: number, that: number): number => self + that)
*
* sum(2, 3) // => 5
* pipe(2, sum(3)) // => 5
* ```
*
* **Example** (Selecting data-first or data-last style with a predicate)
*
* ```ts import.meta.vitest
* import { Function, pipe } from "effect"
*
* const sum = Function.dual<
*   (that: number) => (self: number) => number,
*   (self: number, that: number) => number
* >(
*   (args) => args.length === 2,
*   (self, that) => self + that
* )
*
* sum(2, 3) // => 5
* pipe(2, sum(3)) // => 5
* ```
*
* @stability stable
* @category combinators
* @since 2.0.0
*/
const dual = function(arity, body) {
	if (typeof arity === "function") return function() {
		return arity(arguments) ? body.apply(this, arguments) : (self) => body(self, ...arguments);
	};
	switch (arity) {
		case 0:
		case 1: throw new RangeError(`Invalid arity ${arity}`);
		case 2: return function(a, b) {
			if (arguments.length >= 2) return body(a, b);
			return function(self) {
				return body(self, a);
			};
		};
		case 3: return function(a, b, c) {
			if (arguments.length >= 3) return body(a, b, c);
			return function(self) {
				return body(self, a, b);
			};
		};
		default: return function() {
			if (arguments.length >= arity) return body.apply(this, arguments);
			const args = arguments;
			return function(self) {
				return body(self, ...args);
			};
		};
	}
};
/**
* Returns its input argument unchanged.
*
* **When to use**
*
* Use to return a value unchanged where a function is required.
*
* **Example** (Returning the same value)
*
* ```ts import.meta.vitest
* import { identity } from "effect"
*
* identity(5) // => 5
* ```
*
* @stability stable
* @category combinators
* @since 2.0.0
*/
const identity = (a) => a;
/**
* Creates a zero-argument function that always returns the provided value.
*
* **When to use**
*
* Use when you need a thunk or callback that returns the same value on every
* invocation.
*
* **Example** (Creating a constant thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* const constNull = Function.constant(null)
*
* constNull() // => null
* constNull() // => null
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const constant = (value) => () => value;
/**
* Returns `true` when called.
*
* **When to use**
*
* Use when you need a thunk that returns `true` on every invocation.
*
* **Example** (Returning true from a thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* Function.constTrue() // => true
* ```
*
* @stability stable
* @category constants
* @since 2.0.0
*/
const constTrue = /*#__PURE__*/ constant(true);
/**
* Returns `false` when called.
*
* **When to use**
*
* Use when you need a thunk that returns `false` on every invocation.
*
* **Example** (Returning false from a thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* Function.constFalse() // => false
* ```
*
* @stability stable
* @category constants
* @since 2.0.0
*/
const constFalse = /*#__PURE__*/ constant(false);
/**
* Returns `null` when called.
*
* **When to use**
*
* Use when you need a thunk that returns `null` on every invocation.
*
* **Example** (Returning null from a thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* Function.constNull() // => null
* ```
*
* @stability stable
* @category constants
* @since 2.0.0
*/
const constNull = /*#__PURE__*/ constant(null);
/**
* Returns `undefined` when called.
*
* **When to use**
*
* Use when you need a thunk that returns `undefined` on every invocation.
*
* **Example** (Returning undefined from a thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* Function.constUndefined() // => undefined
* ```
*
* @stability stable
* @category constants
* @since 2.0.0
*/
const constUndefined = /*#__PURE__*/ constant(void 0);
/**
* Returns no meaningful value when called.
*
* **When to use**
*
* Use when you need a thunk that is called only for its effect and has no
* meaningful return value.
*
* **Example** (Returning void from a thunk)
*
* ```ts import.meta.vitest
* import { Function } from "effect"
*
* Function.constVoid() // => undefined
* ```
*
* @stability stable
* @category constants
* @since 2.0.0
*/
const constVoid = constUndefined;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/equal.js
/** @internal */
const getAllObjectKeys = (obj) => {
	const keys = new Set(Reflect.ownKeys(obj));
	if (obj.constructor === Object) return keys;
	if (obj instanceof Error) keys.delete("stack");
	const proto = Object.getPrototypeOf(obj);
	let current = proto;
	while (current !== null && current !== Object.prototype) {
		const ownKeys = Reflect.ownKeys(current);
		for (let i = 0; i < ownKeys.length; i++) keys.add(ownKeys[i]);
		current = Object.getPrototypeOf(current);
	}
	if (keys.has("constructor") && typeof obj.constructor === "function" && proto === obj.constructor.prototype) keys.delete("constructor");
	return keys;
};
/** @internal */
const byReferenceInstances = /*#__PURE__*/ new WeakSet();
/** @internal */
const viewBytes = (view) => new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
/** @internal */
const isArrayBufferLike = (u) => u instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && u instanceof SharedArrayBuffer;
/**
* Returns `undefined` for detached buffers, which can no longer be read.
*
* @internal
*/
const bufferBytes = (buffer) => {
	try {
		return new Uint8Array(buffer);
	} catch {
		return;
	}
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/hash.js
/**
* Back-edge count used to avoid caching entry-point-dependent hashes.
*
* @internal
*/
let backEdges = 0;
/** @internal */
const addBackEdge = () => {
	backEdges++;
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Predicate.js
/**
* Defines runtime checks for values.
*
* A `Predicate<A>` returns `true` or `false` for an `A`. A
* `Refinement<A, B>` is a predicate that also narrows the TypeScript type when
* it succeeds. This module includes guards for common JavaScript values,
* property and tag checks, tuple and struct checks, boolean combinators, and
* helpers for composing predicates and refinements.
*
* @stability stable
* @since 2.0.0
*/
/**
* Checks whether a value is a `string`.
*
* **When to use**
*
* Use when you need a `Predicate` guard to narrow an `unknown` value to a
* string.
*
* **Details**
*
* Uses `typeof input === "string"`.
*
* **Example** (Guarding strings)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const data: unknown = "hi"
*
* if (Predicate.isString(data)) {
*   data.toUpperCase() // => "HI"
* }
* ```
*
* @see {@link isNumber}
* @see {@link isBoolean}
* @see {@link Refinement}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isString(input) {
	return typeof input === "string";
}
/**
* Checks whether a value is a `number`.
*
* **When to use**
*
* Use when you need a `Predicate` guard to narrow an `unknown` value to a
* number.
*
* **Details**
*
* Uses `typeof input === "number"` and does not exclude `NaN` or `Infinity`.
*
* **Example** (Guarding numbers)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const data: unknown = 42
*
* if (Predicate.isNumber(data)) {
*   data + 1 // => 43
* }
* ```
*
* @see {@link isBigInt}
* @see {@link isString}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isNumber(input) {
	return typeof input === "number";
}
/**
* Checks whether a value is a `boolean`.
*
* **When to use**
*
* Use when you need a `Predicate` guard to narrow an `unknown` value to a
* boolean.
*
* **Details**
*
* Uses `typeof input === "boolean"`.
*
* **Example** (Guarding booleans)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const data: unknown = true
*
* if (Predicate.isBoolean(data)) {
*   data ? "yes" : "no" // => "yes"
* }
* ```
*
* @see {@link isString}
* @see {@link isNumber}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isBoolean(input) {
	return typeof input === "boolean";
}
/**
* Checks whether a value is a `function`.
*
* **When to use**
*
* Use when you need a `Predicate` guard to narrow an `unknown` value to a
* callable function.
*
* **Details**
*
* Uses `typeof input === "function"`.
*
* **Example** (Guarding functions)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const data: unknown = () => 1
*
* if (Predicate.isFunction(data)) {
*   data() // => 1
* }
* ```
*
* @see {@link isObjectKeyword}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isFunction(input) {
	return typeof input === "function";
}
/**
* Checks whether a value is not `null`.
*
* **When to use**
*
* Use when you need a `Predicate` refinement that filters out `null` while
* preserving other falsy values.
*
* **Details**
*
* Returns a refinement that excludes `null`.
*
* **Example** (Filtering null values)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const values = [1, null, 2]
* const nonNull = values.filter(Predicate.isNotNull) // => [1, 2]
* ```
*
* @see {@link isNull}
* @see {@link isNotNullish}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isNotNull(input) {
	return input !== null;
}
/**
* Checks whether a value is a non-null object value that is not an array.
*
* **When to use**
*
* Use to narrow unknown input to a non-null, non-array object with a
* `Predicate` guard.
*
* **Details**
*
* This is a structural runtime check using `typeof input === "object"`, so it
* also accepts object instances such as `Date`, `Map`, class instances, and
* typed arrays. It excludes `null` and arrays.
*
* **Example** (Guarding objects)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* Predicate.isObject({ a: 1 }) // => true
* Predicate.isObject([1, 2]) // => false
* ```
*
* @see {@link isObjectOrArray}
* @see {@link isReadonlyObject}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isObject(input) {
	return typeof input === "object" && input !== null && !Array.isArray(input);
}
/**
* Checks whether a value is an `object` in the JavaScript sense (objects, arrays, functions).
*
* **When to use**
*
* Use when you need a `Predicate` guard that accepts arrays and functions as
* well as objects.
*
* **Details**
*
* Returns `true` for arrays and functions, and `false` for `null`.
*
* **Example** (Checking object keywords)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* Predicate.isObjectKeyword(() => 1) // => true
* Predicate.isObjectKeyword(null) // => false
* ```
*
* @see {@link isObject}
* @see {@link isObjectOrArray}
* @stability stable
* @category guards
* @since 4.0.0
*/
function isObjectKeyword(input) {
	return typeof input === "object" && input !== null || isFunction(input);
}
/**
* Checks whether a value has a given property key.
*
* **When to use**
*
* Use when you need a `Predicate` guard for property access on `unknown`
* values with a simple structural object check.
*
* **Details**
*
* Uses the `in` operator and `isObjectKeyword`. This does not check property
* value types.
*
* **Example** (Guarding object properties)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const hasName = Predicate.hasProperty("name")
* const data: unknown = { name: "Ada" }
*
* if (hasName(data)) {
*   data.name // => "Ada"
* }
* ```
*
* @see {@link isTagged}
* @see {@link isObjectKeyword}
* @stability stable
* @category guards
* @since 2.0.0
*/
const hasProperty = /*#__PURE__*/ dual(2, (self, property) => isObjectKeyword(self) && property in self);
/**
* Checks whether a value has a `_tag` property equal to the given tag.
*
* **When to use**
*
* Use when you model tagged unions with a `_tag` field and want a quick
* `Predicate` guard for tagged values.
*
* **Details**
*
* Uses `hasProperty` and strict equality on `_tag`.
*
* **Example** (Guarding tagged values)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const isOk = Predicate.isTagged("Ok")
*
* isOk({ _tag: "Ok", value: 1 }) // => true
* ```
*
* @see {@link hasProperty}
* @stability stable
* @category guards
* @since 2.0.0
*/
const isTagged = /*#__PURE__*/ dual(2, (self, tag) => hasProperty(self, "_tag") && self["_tag"] === tag);
/**
* Checks whether a value is iterable.
*
* **When to use**
*
* Use when you need a `Predicate` guard before iterating an unknown value.
*
* **Details**
*
* Accepts strings as iterable and uses `hasProperty` for `Symbol.iterator`.
*
* **Example** (Guarding iterables)
*
* ```ts import.meta.vitest
* import { Predicate } from "effect"
*
* const data: unknown = [1, 2, 3]
*
* Predicate.isIterable(data) // => true
* ```
*
* @see {@link isSet}
* @see {@link isMap}
* @stability stable
* @category guards
* @since 2.0.0
*/
function isIterable(input) {
	return hasProperty(input, Symbol.iterator) || isString(input);
}

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Hash.js
/**
* Computes Effect hash values and defines the interface for objects that want
* to provide their own hash implementation. Hashes are small numeric
* fingerprints used by Effect data structures to bucket values quickly; they
* are not cryptographic digests and they are not proof that two values are
* equal. The module also includes helpers for primitive, structure, array, and
* reference-based hashes, plus functions for combining and optimizing numeric
* hash values.
*
* @stability stable
* @since 2.0.0
*/
/**
* Defines the unique identifier used to identify objects that implement the Hash interface.
*
* **When to use**
*
* Use as the computed property key for the method that supplies a custom hash
* value on a `Hash` implementor.
*
* @see {@link Hash} for the interface implemented with this symbol
* @see {@link isHash} for checking whether a value implements `Hash`
* @see {@link hash} for computing hash values
*
* @stability stable
* @category symbols
* @since 2.0.0
*/
const symbol$1 = "~effect/Hash";
/**
* Computes a hash value for any given value.
*
* **When to use**
*
* Use to compute an Effect hash for primitives, collections, and hashable
* objects.
*
* **Details**
*
* This function can hash primitives (numbers, strings, booleans, etc.) as well as
* objects, arrays, and other complex data structures. It automatically handles
* different types and provides a consistent hash value for equivalent inputs.
*
* **Gotchas**
*
* Objects being hashed must be treated as immutable after their first hash
* computation. Hash results are cached, so mutating an object after hashing will
* lead to stale cached values and broken hash-based operations. For mutable
* objects, implement a custom `Hash` interface that hashes the object reference
* rather than its content.
*
* **Example** (Hashing different values)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* Hash.hash(42) === Hash.hash(42) // => true
* Hash.hash("hello") === Hash.hash("hello") // => true
* Hash.hash([1, 2, 3]) === Hash.hash([1, 2, 3]) // => true
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const hash = (self) => {
	switch (typeof self) {
		case "number": return number(self);
		case "bigint": return string(self.toString(10));
		case "string": return string(self);
		case "function":
		case "object": if (self === null) break;
		else if (self instanceof Date) {
			if (Number.isNaN(self.getTime())) return string("Invalid Date");
			return string(self.toISOString());
		} else if (self instanceof RegExp) return string(self.toString());
		else {
			if (byReferenceInstances.has(self)) return random$1(self);
			const cached = hashCache.get(self);
			if (cached !== void 0) return cached;
			if (visitedObjects.has(self)) {
				addBackEdge();
				return string("[Circular]");
			}
			visitedObjects.add(self);
			const seen = backEdges;
			let h;
			try {
				if (isHash(self)) h = self[symbol$1]();
				else if (typeof self === "function") h = random$1(self);
				else if (isArrayBufferLike(self)) {
					const bytes = bufferBytes(self);
					h = bytes === void 0 ? random$1(self) : array(bytes);
				} else if (self instanceof DataView) h = array(viewBytes(self));
				else if (Array.isArray(self) || ArrayBuffer.isView(self)) h = array(self);
				else if (self instanceof Map) h = hashMap(self);
				else if (self instanceof Set) h = hashSet(self);
				else h = structure(self);
			} finally {
				visitedObjects.delete(self);
			}
			if (seen === backEdges) hashCache.set(self, h);
			return h;
		}
	}
	return optimize(mix(string(String(self))));
};
/**
* Generates a random hash value for an object and caches it.
*
* **When to use**
*
* Use to hash an object by reference identity instead of structural content.
*
* **Details**
*
* This function creates a random hash value for objects that don't have their own
* hash implementation. The hash value is cached using a WeakMap, so the same object
* will always return the same hash value during its lifetime.
*
* **Example** (Hashing objects by reference)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* const obj1 = { a: 1 }
* const obj2 = { a: 1 }
*
* Hash.random(obj1) === Hash.random(obj1) // => true
*
* typeof Hash.random(obj2) // => "number"
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const random$1 = (self) => {
	if (!randomHashCache.has(self)) randomHashCache.set(self, optimize(Math.random() * 4294967296 | 0));
	return randomHashCache.get(self);
};
const mix = (h) => {
	h ^= h >>> 16;
	h = Math.imul(h, 2246822507);
	h ^= h >>> 13;
	h = Math.imul(h, 3266489909);
	return h ^ h >>> 16;
};
/**
* Combines two hash values into a single hash value.
*
* **When to use**
*
* Use to build a hash for a composite value by folding together hash values for
* its parts.
*
* **Details**
*
* Supports direct and pipeable usage. Argument order affects the result.
*
* **Example** (Combining hash values)
*
* ```ts import.meta.vitest
* import { Hash, pipe } from "effect"
*
* const hash1 = Hash.hash("hello")
* const hash2 = Hash.hash("world")
*
* const combined = Hash.combine(hash2)(hash1)
* combined === pipe(hash1, Hash.combine(hash2)) // => true
* ```
*
* @see {@link hash} for computing hash values from arbitrary inputs
* @see {@link structureKeys} for hashing selected object fields without manual combination
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const combine = /*#__PURE__*/ dual(2, (self, b) => mix(Math.imul(self, 2654435761) + Math.imul(b, 2246822507)));
/**
* Applies bit manipulation techniques to optimize a hash value.
*
* **When to use**
*
* Use to improve the bit distribution of a raw numeric hash value.
*
* **Details**
*
* This function takes a hash value and applies bitwise operations to improve
* the distribution of hash values, reducing the likelihood of collisions.
*
* **Example** (Optimizing a hash value)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* Hash.optimize(1234567890) // => 160826066
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const optimize = (n) => n & 3221225471 | n >>> 1 & 1073741824;
/**
* Checks whether a value implements the Hash interface.
*
* **When to use**
*
* Use to detect whether an unknown value provides a custom hash implementation.
*
* **Details**
*
* This function determines whether a given value has a function under the Hash
* symbol, indicating that it can provide its own hash value implementation.
* Data that merely carries the key, such as parsed JSON, is hashed as data.
*
* **Example** (Checking for Hash support)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* class MyHashable implements Hash.Hash {
*   [Hash.symbol]() {
*     return 42
*   }
* }
*
* Hash.isHash(new MyHashable()) // => true
* Hash.isHash({}) // => false
* Hash.isHash("string") // => false
* ```
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isHash = (u) => hasProperty(u, "~effect/Hash") && typeof u["~effect/Hash"] === "function";
const float64 = /*#__PURE__*/ new DataView(/*#__PURE__*/ new ArrayBuffer(8));
/**
* Computes a hash value for a number.
*
* **When to use**
*
* Use to hash a JavaScript number with Effect's numeric hash semantics.
*
* **Details**
*
* Int32 values hash to themselves. Other numbers hash from their IEEE-754 bits,
* with a canonical representation for `NaN`.
*
* **Example** (Hashing numbers)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* Number.isInteger(Hash.number(42)) // => true
* Number.isInteger(Hash.number(3.14)) // => true
* Hash.number(NaN) === Hash.number(NaN) // => true
* Hash.number(Infinity) === Hash.number(Infinity) // => true
* Hash.number(100) === Hash.number(100) // => true
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const number = (n) => {
	const h = n | 0;
	if (h === n) return optimize(h);
	float64.setFloat64(0, n !== n ? NaN : n);
	return optimize(combine(float64.getInt32(0), float64.getInt32(4)));
};
/**
* Computes a hash value for a string using the djb2 algorithm.
*
* **When to use**
*
* Use when you need a string field to contribute to a custom structural hash
* implementation.
*
* **Details**
*
* This function implements a variation of the djb2 hash algorithm, which is
* known for its good distribution properties and speed. It processes each
* character of the string to produce a consistent hash value.
*
* **Example** (Hashing strings)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* Hash.string("hello") // => 181380007
* Hash.string("world") // => 164394279
* Hash.string("") // => 5381
* Hash.string("test") === Hash.string("test") // => true
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const string = (str) => {
	let h = 5381, i = str.length;
	while (i) h = h * 33 ^ str.charCodeAt(--i);
	return optimize(h);
};
/**
* Computes a hash value for an object using only the specified keys.
*
* **When to use**
*
* Use to hash an object by a selected set of property keys.
*
* **Details**
*
* This function allows you to hash an object by considering only specific keys,
* which is useful when you want to create a hash based on a subset of an object's
* properties.
*
* **Example** (Hashing selected object keys)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* const person = { name: "John", age: 30, city: "New York" }
*
* const hash1 = Hash.structureKeys(person, ["name", "age"])
* const hash2 = Hash.structureKeys(person, ["name", "city"])
*
* hash1 // => -731887653
* hash2 // => 148523102
*
* const person2 = { name: "John", age: 30, city: "Boston" }
* const hash3 = Hash.structureKeys(person2, ["name", "age"])
* hash1 === hash3 // => true
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const structureKeys = (o, keys) => {
	let h = 12289;
	for (const key of keys) h ^= combine(hash(key), hash(o[key]));
	return optimize(h);
};
/**
* Computes a structural hash for an object using Effect's object key collection.
*
* **When to use**
*
* Use to hash an object from all structural keys collected by Effect.
*
* **Details**
*
* The hash is based on the object's structural keys and their values, including
* symbol keys and relevant prototype keys for non-plain objects.
*
* **Example** (Hashing object structures)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* const obj1 = { name: "John", age: 30 }
* const obj2 = { name: "Jane", age: 25 }
* const obj3 = { name: "John", age: 30 }
*
* Hash.structure(obj1) // => -731887653
* Hash.structure(obj2) // => -222100417
* Hash.structure(obj3) // => -731887653
* Hash.structure(obj1) === Hash.structure(obj3) // => true
* ```
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const structure = (o) => structureKeys(o, getAllObjectKeys(o));
const unordered = (seed, f) => (iter) => {
	let h = seed;
	for (const element of iter) h ^= f(element);
	return optimize(h);
};
/**
* Computes a hash value for an iterable by hashing all of its elements.
*
* **When to use**
*
* Use to hash the values yielded by an iterable with Effect hash semantics.
*
* **Details**
*
* Folds element hashes with {@link combine}, so order and length affect the
* result.
*
* **Gotchas**
*
* A hash is not an equality proof. Distinct inputs can still share a hash.
*
* **Example** (Hashing arrays)
*
* ```ts import.meta.vitest
* import { Hash } from "effect"
*
* const arr1 = [1, 2, 3]
* const arr2 = [1, 2, 3]
* const arr3 = [3, 2, 1]
*
* Hash.array(arr1) === Hash.array(arr2) // => true
* Hash.array(arr1) === Hash.array(arr3) // => false
* ```
*
* @see {@link hash} for the general-purpose hash dispatcher
*
* @stability stable
* @category hashing
* @since 2.0.0
*/
const array = (arr) => {
	let h = 6151;
	for (const element of arr) h = combine(h, hash(element));
	return optimize(h);
};
const hashMap = /*#__PURE__*/ unordered(/*#__PURE__*/ string("Map"), ([k, v]) => combine(hash(k), hash(v)));
const setSeed = /*#__PURE__*/ string("Set");
const hashSet = /*#__PURE__*/ unordered(setSeed, (element) => combine(setSeed, hash(element)));
const randomHashCache = /*#__PURE__*/ new WeakMap();
const hashCache = /*#__PURE__*/ new WeakMap();
const visitedObjects = /*#__PURE__*/ new WeakSet();

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Equal.js
/**
* Defines the unique string identifier for the `Equal` interface.
*
* **When to use**
*
* Use when you implement custom equality and need the computed property key for
* the equality method.
*
* **Details**
*
* This is a pure constant with no allocation or side effects.
*
* **Example** (Implementing Equal on a class)
*
* ```ts import.meta.vitest
* import { Equal, Hash } from "effect"
*
* class UserId implements Equal.Equal {
*   constructor(readonly id: string) {}
*
*   [Equal.symbol](that: Equal.Equal): boolean {
*     return that instanceof UserId && this.id === that.id
*   }
*
*   [Hash.symbol](): number {
*     return Hash.string(this.id)
*   }
* }
*
* Equal.equals(new UserId("1"), new UserId("1")) // => true
* Equal.equals(new UserId("1"), new UserId("2")) // => false
* ```
*
* @see {@link Equal} — the interface that uses this symbol
* @see {@link isEqual} — type guard for `Equal` implementors
* @stability stable
* @category symbols
* @since 2.0.0
*/
const symbol = "~effect/Equal";
function equals$1() {
	if (arguments.length === 1) return (self) => compareBoth(self, arguments[0]);
	return compareBoth(arguments[0], arguments[1]);
}
function compareBoth(self, that) {
	if (self === that) return true;
	if (self == null || that == null) return false;
	const selfType = typeof self;
	if (selfType !== typeof that) return false;
	if (selfType === "number" && self !== self && that !== that) return true;
	if (selfType !== "object" && selfType !== "function") return false;
	if (byReferenceInstances.has(self) || byReferenceInstances.has(that)) return false;
	return compareObjects(self, that);
}
function compareObjects(self, that) {
	const depth = pathLeft.length;
	for (let i = depth; i-- > 0;) if (pathLeft[i] === self && pathRight[i] === that) return true;
	if (depth) return compareOnPath(self, that);
	let known = results.get(self);
	if (!known) results.set(self, known = /* @__PURE__ */ new WeakMap());
	let result = known.get(that);
	if (result === void 0) known.set(that, result = compareOnPath(self, that));
	return result;
}
function compareOnPath(self, that) {
	pathLeft.push(self);
	pathRight.push(that);
	try {
		return compareStructure(self, that);
	} finally {
		pathLeft.pop();
		pathRight.pop();
	}
}
const pathLeft = [];
const pathRight = [];
const results = /*#__PURE__*/ new WeakMap();
function compareStructure(self, that) {
	if (hash(self) !== hash(that)) return false;
	else if (self instanceof Date) {
		if (!(that instanceof Date)) return false;
		const selfTime = self.getTime();
		const thatTime = that.getTime();
		return selfTime === thatTime || Number.isNaN(selfTime) && Number.isNaN(thatTime);
	} else if (self instanceof RegExp) return that instanceof RegExp && self.toString() === that.toString();
	const bothEquals = isEqual(self);
	if (bothEquals !== isEqual(that) || typeof self === "function" && !bothEquals) return false;
	else if (bothEquals) return self[symbol](that);
	else if (Array.isArray(self)) {
		if (!Array.isArray(that) || self.length !== that.length) return false;
		return compareArrays(self, that);
	} else if (isArrayBufferLike(self)) {
		if (!isArrayBufferLike(that) || self instanceof ArrayBuffer !== that instanceof ArrayBuffer) return false;
		const selfBytes = bufferBytes(self);
		const thatBytes = bufferBytes(that);
		return selfBytes !== void 0 && thatBytes !== void 0 && compareTypedArrays(selfBytes, thatBytes);
	} else if (ArrayBuffer.isView(self)) {
		const selfIsDataView = self instanceof DataView;
		if (!ArrayBuffer.isView(that) || self.byteLength !== that.byteLength || selfIsDataView !== that instanceof DataView) return false;
		if (selfIsDataView) return compareTypedArrays(viewBytes(self), viewBytes(that));
		return compareTypedArrays(self, that);
	} else if (self instanceof Map) {
		if (!(that instanceof Map) || self.size !== that.size) return false;
		return compareHashed(self, that, entryHash, equalEntries);
	} else if (self instanceof Set) {
		if (!(that instanceof Set) || self.size !== that.size) return false;
		return compareHashed(self, that, hash, compareBoth);
	}
	return compareRecords(self, that);
}
function compareArrays(self, that) {
	for (let i = 0; i < self.length; i++) if (!compareBoth(self[i], that[i])) return false;
	return true;
}
function compareTypedArrays(self, that) {
	if (self.length !== that.length) return false;
	for (let i = 0; i < self.length; i++) if (self[i] !== that[i]) return false;
	return true;
}
function compareRecords(self, that) {
	const selfKeys = getAllObjectKeys(self);
	const thatKeys = getAllObjectKeys(that);
	if (selfKeys.size !== thatKeys.size) return false;
	for (const key of selfKeys) if (!thatKeys.has(key) || !compareBoth(self[key], that[key])) return false;
	return true;
}
function compareHashed(self, that, hashOf, equivalent) {
	const groups = /* @__PURE__ */ new Map();
	let remaining = 0;
	for (const item of that) {
		const h = hashOf(item);
		const group = groups.get(h);
		if (group) group.push(item);
		else groups.set(h, [item]);
		remaining++;
	}
	outer: for (const item of self) {
		const group = groups.get(hashOf(item));
		if (group) {
			for (let i = 0; i < group.length; i++) if (equivalent(item, group[i])) {
				group[i] = group[group.length - 1];
				group.pop();
				remaining--;
				continue outer;
			}
		}
		return false;
	}
	return remaining === 0;
}
const entryHash = (entry) => hash(entry[0]);
const equalEntries = (self, that) => compareBoth(self[0], that[0]) && compareBoth(self[1], that[1]);
/**
* Checks whether a value implements the {@link Equal} interface.
*
* **When to use**
*
* Use when you need generic utility code to distinguish `Equal` implementors
* from plain values before calling `[Equal.symbol]` directly.
*
* **Details**
*
* - Pure function, no side effects.
* - Returns `true` if and only if `u` has a function keyed by {@link symbol}.
*   Data that merely carries the key, such as parsed JSON, is not `Equal`.
* - Acts as a TypeScript type guard, narrowing the input to {@link Equal}.
*
* **Example** (Checking Equal values)
*
* ```ts import.meta.vitest
* import { Equal, Hash } from "effect"
*
* class Token implements Equal.Equal {
*   constructor(readonly value: string) {}
*   [Equal.symbol](that: Equal.Equal): boolean {
*     return that instanceof Token && this.value === that.value
*   }
*   [Hash.symbol](): number {
*     return Hash.string(this.value)
*   }
* }
*
* Equal.isEqual(new Token("abc")) // => true
* Equal.isEqual({ x: 1 }) // => false
* Equal.isEqual(42) // => false
* ```
*
* @see {@link Equal} — the interface being checked
* @see {@link symbol} — the property key that signals `Equal` support
* @stability stable
* @category guards
* @since 2.0.0
*/
const isEqual = (u) => hasProperty(u, "~effect/Equal") && typeof u["~effect/Equal"] === "function";
/**
* Wraps {@link equals} as an `Equivalence<A>`.
*
* **When to use**
*
* Use when you want to pass `Equal.equals` to APIs that require an
* `Equivalence`.
*
* **Details**
*
* - Returns a function `(a: A, b: A) => boolean` that delegates to
*   {@link equals}.
* - Pure; allocates a thin wrapper on each call.
*
* **Example** (Deduplicating with Equal semantics)
*
* ```ts import.meta.vitest
* import { Array, Equal } from "effect"
*
* Array.dedupeWith([1, 2, 2, 3, 1], Equal.asEquivalence<number>()) // => [1, 2, 3]
* ```
*
* @see {@link equals} — the underlying comparison function
* @stability stable
* @category instances
* @since 4.0.0
*/
const asEquivalence = () => equals$1;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Redactable.js
/**
* Defines the symbol used to identify objects that implement the {@link Redactable}
* protocol.
*
* **When to use**
*
* Use as the property key when implementing the `Redactable` protocol.
*
* **Details**
*
* Add a method under this key to make an object redactable. The method receives
* the current `Context` and must return the replacement value. The symbol is
* registered globally via `Symbol.for("~effect/Redactable")`, so it is
* identical across multiple copies of the library at runtime.
*
* **Example** (Masking an API key)
*
* ```ts import.meta.vitest
* import { Context, Redactable } from "effect"
*
* class ApiKey {
*   constructor(readonly raw: string) {}
*
*   [Redactable.symbolRedactable](_ctx: Context.Context<never>) {
*     return this.raw.slice(0, 4) + "..."
*   }
* }
*
* Redactable.redact(new ApiKey("secret-key")) // => "secr..."
* ```
*
* @see {@link Redactable} for the interface this symbol belongs to
* @see {@link isRedactable} to check whether a value has this symbol
* @stability stable
* @category symbols
* @since 3.10.0
*/
const symbolRedactable = /*#__PURE__*/ Symbol.for("~effect/Redactable");
/**
* Type guard that checks whether a value implements the {@link Redactable}
* interface.
*
* **When to use**
*
* Use to narrow an unknown value before calling redaction-specific helpers.
*
* @see {@link Redactable} for the interface being checked
* @see {@link redact} to apply redaction if the value is redactable
* @stability stable
* @category guards
* @since 3.10.0
*/
const isRedactable = (u) => hasProperty(u, symbolRedactable);
/**
* Returns a redacted value if it implements {@link Redactable}, otherwise returns it
* unchanged.
*
* **When to use**
*
* Use as the general-purpose entry point for redaction when the input may
* or may not implement the redaction protocol.
*
* **Details**
*
* This function calls {@link isRedactable} and, when it returns `true`,
* delegates to {@link getRedacted}.
*
* **Gotchas**
*
* Redaction is not recursive. Nested redactable values inside the returned
* object are not automatically redacted.
*
* @see {@link isRedactable} to check before redacting
* @see {@link getRedacted} for the lower-level variant for known redactables
* @stability stable
* @category destructors
* @since 3.10.0
*/
function redact(u) {
	if (isRedactable(u)) return getRedacted(u);
	return u;
}
/**
* Returns the result of calling `[symbolRedactable]` on a value that is
* already known to be {@link Redactable}.
*
* **When to use**
*
* Use when you need to read the redacted representation from a value already
* verified as `Redactable`.
*
* **Details**
*
* This function reads the current fiber's `Context` from the global fiber
* reference and passes it to the redaction method.
*
* **Gotchas**
*
* If no fiber is active, an empty `Context` is passed to the redaction method.
*
* @see {@link redact} for the higher-level variant that handles non-redactable values
* @see {@link isRedactable} for the type guard to verify before calling this
* @stability stable
* @category destructors
* @since 4.0.0
*/
function getRedacted(redactable) {
	return redactable[symbolRedactable](globalThis["~effect/Fiber/currentFiber"]?.context ?? emptyContext$1);
}
/** @internal */
const currentFiberTypeId = "~effect/Fiber/currentFiber";
const emptyMap = /*#__PURE__*/ new Map();
const emptyContext$1 = {
	"~effect/Context": {},
	base: emptyMap,
	depth: 0,
	mapUnsafe: emptyMap,
	pipe() {
		return pipeArguments(this, arguments);
	}
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Formatter.js
/**
* Formats JavaScript values into readable strings.
*
* `format` is intended for logs, diagnostics, and error messages. It handles
* primitives, objects, arrays, dates, regular expressions, maps, sets, class
* instances, errors, circular references, and redactable values. `formatJson`
* wraps JSON formatting with redaction and circular-reference handling, and the
* module also includes helpers for property keys, paths, and dates.
*
* @stability stable
* @since 4.0.0
*/
/**
* Converts any JavaScript value into a human-readable string.
*
* **When to use**
*
* Use when you need to format arbitrary JavaScript values for debugging,
* logging, or error messages.
*
* **Details**
*
* - Output is **not** valid JSON; use {@link formatJson} when you need
*   parseable JSON.
* - Handles `BigInt`, `Symbol`, `Set`, `Map`, `Date`, `RegExp`, and class
*   instances that `JSON.stringify` cannot represent.
* - Circular references are shown as `"[Circular]"` instead of throwing.
* - Failures while inspecting a value are rendered as diagnostic placeholders instead of throwing.
* - Primitives: stringified naturally (`null`, `undefined`, `123`, `true`).
*   Strings are JSON-quoted.
* - Objects with a custom `toString` (not `Object.prototype.toString`):
*   `toString()` is called unless `ignoreToString` is `true`.
* - Errors with a `cause`: formatted as `"<message> (cause: <cause>)"`.
* - Iterables (`Set`, `Map`, etc.): formatted as
*   `ClassName([...elements])`.
* - Class instances: wrapped as `ClassName({...})`.
* - `Redactable` values are automatically redacted.
* - Arrays/objects with 0–1 entries are inline; larger ones are
*   pretty-printed when `space` is set.
* - `space` — indentation unit (number of spaces, or a string like
*   `"\t"`). Defaults to `0` (compact).
* - `ignoreToString` — skip calling `toString()`. Defaults to `false`.
*
* **Example** (Formatting compact output)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* Formatter.format({ a: 1, b: [2, 3] }) // => "{\"a\":1,\"b\":[2,3]}"
* ```
*
* **Example** (Pretty-printed output)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* const output = Formatter.format({ a: 1, b: [2, 3] }, { space: 2 })
* output // => "{\n  \"a\": 1,\n  \"b\": [\n    2,\n    3\n  ]\n}"
* ```
*
* **Example** (Handling circular references)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* const obj: any = { name: "loop" }
* obj.self = obj
* Formatter.format(obj) // => "{\"name\":\"loop\",\"self\":[Circular]}"
* ```
*
* @see {@link formatJson}
* @see {@link Formatter}
* @stability stable
* @category formatting
* @since 2.0.0
*/
function format(input, options) {
	const space = options?.space ?? 0;
	const ancestors = /* @__PURE__ */ new WeakSet();
	const gap = !space ? "" : typeof space === "number" ? " ".repeat(space) : space;
	const ind = (d) => gap.repeat(d);
	const wrap = (v, body) => {
		const ctor = v?.constructor;
		return ctor && ctor !== Object.prototype.constructor && ctor.name ? `${ctor.name}(${body})` : body;
	};
	const ownKeys = (o) => {
		try {
			return Reflect.ownKeys(o);
		} catch {
			return ["[ownKeys threw]"];
		}
	};
	function recur(v, d = 0) {
		try {
			return recurUnsafe(v, d);
		} catch {
			if (typeof v === "object" && v !== null || typeof v === "function") ancestors.delete(v);
			return "[inspection threw]";
		}
	}
	function recurUnsafe(v, d = 0) {
		if (typeof v === "string") return JSON.stringify(v);
		if (typeof v === "number" || v == null || typeof v === "boolean" || typeof v === "symbol") return String(v);
		if (typeof v === "bigint") return String(v) + "n";
		if (typeof v === "object" || typeof v === "function") {
			if (ancestors.has(v)) return CIRCULAR;
			ancestors.add(v);
			let output;
			if (symbolRedactable in v) output = recur(getRedacted(v), d);
			else if (Array.isArray(v)) output = !gap || v.length <= 1 ? `[${v.map((x) => recur(x, d)).join(",")}]` : `[\n${ind(d + 1)}${v.map((x) => recur(x, d + 1)).join(",\n" + ind(d + 1))}\n${ind(d)}]`;
			else if (v instanceof Date) output = formatDate(v);
			else if (!options?.ignoreToString && hasProperty(v, "toString") && typeof v["toString"] === "function" && v["toString"] !== Object.prototype.toString && v["toString"] !== Array.prototype.toString) {
				const s = safeToString(v);
				output = v instanceof Error && v.cause !== void 0 ? `${s} (cause: ${recur(v.cause, d)})` : s;
			} else if (Symbol.iterator in v) output = `${v.constructor.name}(${recur(Array.from(v), d)})`;
			else {
				const keys = ownKeys(v);
				if (!gap || keys.length <= 1) {
					const body = `{${keys.map((k) => `${formatPropertyKey(k)}:${recur(safeGet(v, k), d)}`).join(",")}}`;
					output = wrap(v, body);
				} else {
					const body = `{\n${keys.map((k) => `${ind(d + 1)}${formatPropertyKey(k)}: ${recur(safeGet(v, k), d + 1)}`).join(",\n")}\n${ind(d)}}`;
					output = wrap(v, body);
				}
			}
			ancestors.delete(v);
			return output;
		}
		return String(v);
	}
	return recur(input, 0);
}
const CIRCULAR = "[Circular]";
/**
* @internal
*/
function formatPropertyKey(name) {
	return typeof name === "string" ? JSON.stringify(name) : String(name);
}
/**
* Formats a `Date` as an ISO 8601 string, returning `"Invalid Date"` for
* invalid dates instead of throwing.
*
* @internal
*/
function formatDate(date) {
	try {
		return date.toISOString();
	} catch {
		return "Invalid Date";
	}
}
function safeToString(input) {
	try {
		const s = input.toString();
		return typeof s === "string" ? s : String(s);
	} catch {
		return "[toString threw]";
	}
}
function safeGet(input, key) {
	try {
		return input[key];
	} catch {
		return "[property access threw]";
	}
}
/**
* Stringifies a value to JSON safely, silently dropping circular references.
*
* **When to use**
*
* Use when you need valid JSON output, unlike `format`, and the input may
* contain circular references that should be silently omitted rather than
* throwing a `TypeError`.
*
* **Details**
*
* Uses `JSON.stringify` internally with a replacer that tracks the current
* object ancestry. Circular references are replaced with `undefined`, which
* omits them from object output. `Redactable` values are automatically redacted
* before serialization. `BigInt` values are stringified with an `n` suffix.
* `Error` instances without a `toJSON` property include their enumerable
* properties plus `name` and `message`. Errors with `toJSON` keep their custom
* representation. Other values follow standard `JSON.stringify` behavior. The
* `space` parameter controls indentation and defaults to `0`.
*
* **Gotchas**
*
* When the root input is `undefined`, a symbol, or a function, `formatJson`
* returns `"null"` instead of the `undefined` returned by `JSON.stringify`.
* Nested values retain standard `JSON.stringify` behavior.
*
* **Example** (Formatting compact JSON)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* Formatter.formatJson({ name: "Alice", age: 30 }) // => "{\"name\":\"Alice\",\"age\":30}"
* ```
*
* **Example** (Handling circular references)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* const obj: any = { name: "test" }
* obj.self = obj
* Formatter.formatJson(obj) // => "{\"name\":\"test\"}"
* ```
*
* **Example** (Pretty-printed JSON)
*
* ```ts import.meta.vitest
* import { Formatter } from "effect"
*
* const output = Formatter.formatJson({ name: "Alice", age: 30 }, { space: 2 })
* output // => "{\n  \"name\": \"Alice\",\n  \"age\": 30\n}"
* ```
*
* @see {@link format}
* @see {@link Formatter}
* @stability stable
* @category serialization
* @since 4.0.0
*/
function formatJson(input, options) {
	const ancestors = [];
	const sources = /* @__PURE__ */ new WeakMap();
	return JSON.stringify(input, function(key, value) {
		const original = Object.getOwnPropertyDescriptor(sources.get(this) ?? this, key)?.value;
		const redacted = hasProperty(original, symbolRedactable) ? redact(original) : redact(value);
		if (typeof redacted === "bigint") return format(redacted);
		if (typeof redacted !== "object" || redacted === null) return redacted;
		const current = redacted instanceof Error && !hasProperty(redacted, "toJSON") ? {
			...redacted,
			name: redacted.name,
			message: redacted.message
		} : redacted;
		while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) ancestors.pop();
		if (ancestors.includes(redacted)) return;
		ancestors.push(redacted);
		if (current !== redacted) ancestors.push(current);
		if (!hasGetter(current) || isJsonPrimitiveWrapper(current)) return current;
		const view = redactingView(current);
		sources.set(view, current);
		ancestors.push(view);
		return view;
	}, options?.space) ?? "null";
}
function hasGetter(object) {
	for (const key of Object.getOwnPropertyNames(object)) if (Object.getOwnPropertyDescriptor(object, key)?.get !== void 0) return true;
	return false;
}
function redactingView(object) {
	const view = Array.isArray(object) ? [] : {};
	const keys = Array.isArray(object) ? Array.from({ length: object.length }, (_, i) => String(i)) : Object.keys(object);
	for (const key of keys) Object.defineProperty(view, key, {
		enumerable: true,
		get: () => {
			const value = Reflect.get(object, key);
			return Object.getOwnPropertyDescriptor(object, key)?.get !== void 0 ? redact(value) : value;
		}
	});
	return view;
}
function isJsonPrimitiveWrapper(object) {
	for (const valueOf of [
		Number.prototype.valueOf,
		Boolean.prototype.valueOf,
		String.prototype.valueOf
	]) try {
		Reflect.apply(valueOf, object, []);
		return true;
	} catch {}
	return false;
}

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Inspectable.js
/**
* Defines the symbol used by Node.js for custom object inspection.
*
* **When to use**
*
* Use to implement Node.js custom inspection for a value.
*
* **Details**
*
* This symbol is recognized by Node.js's `util.inspect()` function and the REPL
* for custom object representation. When an object has a method with this symbol,
* it will be called to determine how the object should be displayed.
*
* **Example** (Defining custom Node inspection)
*
* ```ts import.meta.vitest
* import { Inspectable } from "effect"
*
* class CustomObject {
*   constructor(private value: string) {}
*
*   [Inspectable.NodeInspectSymbol]() {
*     return `CustomObject(${this.value})`
*   }
* }
*
* const obj = new CustomObject("hello")
* obj[Inspectable.NodeInspectSymbol]() // => "CustomObject(hello)"
* ```
*
* @stability stable
* @category symbols
* @since 2.0.0
*/
const NodeInspectSymbol = /*#__PURE__*/ Symbol.for("nodejs.util.inspect.custom");
/**
* Converts a value to its structured inspection representation.
*
* **When to use**
*
* Use when you need the structured representation of an inspectable value
* without risking unhandled errors.
*
* **Details**
*
* This function applies redaction before extracting data from objects that
* implement `toJSON`, recursively processes arrays, and handles errors
* gracefully. Plain objects are returned unchanged, so the result is not
* guaranteed to be accepted by `JSON.stringify`; it may still contain values
* such as `BigInt`, functions, or circular references.
*
* @see {@link toStringUnknown} for converting unknown values to strings
*
* @stability stable
* @category converting
* @since 4.0.0
*/
const toJson = (input) => {
	try {
		input = redact(input);
		if (hasProperty(input, "toJSON") && isFunction(input["toJSON"]) && input["toJSON"].length === 0) return input.toJSON();
		else if (Array.isArray(input)) return input.map(toJson);
		return input;
	} catch {
		return "[toJSON threw]";
	}
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/stackTraceLimit.js
/**
* Check if `Error.stackTraceLimit` is writable.
* Returns `false` if the property is frozen, non-writable, or `Error` is non-extensible.
*
* @internal
*/
const isStackTraceLimitWritable = () => {
	const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
	if (desc === void 0) return Object.isExtensible(Error);
	return Object.hasOwn(desc, "writable") ? desc.writable === true : desc.set !== void 0;
};
const canWriteStackTraceLimit = /*#__PURE__*/ isStackTraceLimitWritable();
/**
* Get the current `Error.stackTraceLimit` value.
* Returns `undefined` if the property doesn't exist.
*
* @internal
*/
const getStackTraceLimit = () => Error.stackTraceLimit;
/**
* Safely set `Error.stackTraceLimit` if possible, otherwise no-op.
*
* Accepts `undefined` so a value read via {@link getStackTraceLimit} can be
* restored faithfully.
*
* @internal
*/
const setStackTraceLimit = (value) => {
	if (canWriteStackTraceLimit) Error.stackTraceLimit = value;
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Utils.js
/**
* Yields its wrapped value exactly once, then completes with the value sent
* back in.
*
* **When to use**
*
* Use to implement `[Symbol.iterator]()` on Effect-like types so they can be
* `yield*`-ed inside generator functions, such as `Effect.gen` and
* `Option.gen`.
*
* **Details**
*
* The first call to `next()` returns a fresh `{ value: self, done: false }`.
* Every subsequent call returns `{ value: a, done: true }` where `a` is the
* argument passed to `next()`. To keep `yield*` cheap, the completion result
* is the iterator itself rather than a new object, so only the iterator and
* the single yielded result are allocated per `yield*`.
*
* **Example** (Yielding a wrapped value in a generator)
*
* ```ts import.meta.vitest
* import { Utils } from "effect"
*
* const gen = new Utils.SingleShotGen<string, number>("hello")
*
* gen.next(0).value // => "hello"
*
* gen.next(42).value // => 42
* ```
*
* @see {@link Gen} for the type-level signature that relies on `SingleShotGen`
* @stability stable
* @category constructors
* @since 2.0.0
*/
var SingleShotGen = class {
	constructor(self) {
		this.value = self;
		this.done = false;
	}
	/**
	* Yields the stored value once, then completes with the value sent back in.
	*
	* **When to use**
	*
	* Use to advance a `SingleShotGen` through its single yield and completion
	* step.
	*
	* @since 2.0.0
	*/
	next(a) {
		if (this.done) {
			this.value = a;
			return this;
		}
		this.done = true;
		return {
			value: this.value,
			done: false
		};
	}
};
const pickInternalCall = () => {
	const InternalTypeId = "~effect/Utils/internal";
	const standard = { [InternalTypeId]: (body) => {
		return body();
	} };
	const forced = { [InternalTypeId]: (body) => {
		try {
			return body();
		} finally {}
	} };
	const limit = getStackTraceLimit();
	if (limit === 0) return forced[InternalTypeId];
	setStackTraceLimit(2);
	const error = standard[InternalTypeId](() => /* @__PURE__ */ new Error());
	setStackTraceLimit(limit);
	return error.stack?.includes(InternalTypeId) === true ? standard[InternalTypeId] : forced[InternalTypeId];
};
/** @internal */
const internalCall = /*#__PURE__*/ pickInternalCall();

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/record.js
/** @internal */
function assignProperty(self, key, value) {
	if (key === "__proto__") Object.defineProperty(self, key, {
		value,
		writable: true,
		enumerable: true,
		configurable: true
	});
	else self[key] = value;
}
/** @internal */
function assignProperties(self, source) {
	if (!Object.hasOwn(source, "__proto__")) {
		Object.assign(self, source);
		return;
	}
	for (const key of Reflect.ownKeys(source)) if (Object.prototype.propertyIsEnumerable.call(source, key)) assignProperty(self, key, source[key]);
}

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/core.js
/** @internal */
const EffectTypeId = `~effect/Effect`;
/** @internal */
const ExitTypeId = `~effect/Exit`;
const effectVariance = {
	_A: identity,
	_E: identity,
	_R: identity
};
/** @internal */
const identifier = `${EffectTypeId}/identifier`;
/** @internal */
const args = `${EffectTypeId}/args`;
/** @internal */
const evaluate = `${EffectTypeId}/evaluate`;
/** @internal */
const contA = `${EffectTypeId}/successCont`;
/** @internal */
const contE = `${EffectTypeId}/failureCont`;
/** @internal */
const contAll = `${EffectTypeId}/ensureCont`;
/** @internal */
const Yield = /*#__PURE__*/ Symbol.for("effect/Effect/Yield");
/** @internal */
const PipeInspectableProto = {
	pipe() {
		return pipeArguments(this, arguments);
	},
	toJSON() {
		return { ...this };
	},
	toString() {
		return format(this.toJSON(), {
			ignoreToString: true,
			space: 2
		});
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
};
/** @internal */
const StructuralProto = {
	[symbol$1]() {
		return structureKeys(this, Object.keys(this));
	},
	[symbol](that) {
		const selfKeys = Object.keys(this);
		const thatKeys = Object.keys(that);
		if (selfKeys.length !== thatKeys.length) return false;
		for (let i = 0; i < selfKeys.length; i++) if (selfKeys[i] !== thatKeys[i] || !equals$1(this[selfKeys[i]], that[selfKeys[i]])) return false;
		return true;
	}
};
/** @internal */
const EffectProto = {
	[EffectTypeId]: effectVariance,
	...PipeInspectableProto,
	[Symbol.iterator]() {
		return new SingleShotGen(this);
	},
	toJSON() {
		return {
			_id: "Effect",
			op: this[identifier],
			..."~effect/Effect/args" in this ? { args: this[args] } : void 0
		};
	}
};
/** @internal */
const isEffect = (u) => hasProperty(u, EffectTypeId);
/** @internal */
const isExit = (u) => hasProperty(u, ExitTypeId);
/** @internal */
const CauseTypeId = "~effect/Cause";
/** @internal */
const CauseReasonTypeId = "~effect/Cause/Reason";
/** @internal */
const isCause = (self) => hasProperty(self, CauseTypeId);
/** @internal */
var CauseImpl = class {
	constructor(failures) {
		this[CauseTypeId] = CauseTypeId;
		this.reasons = failures;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toJSON() {
		return {
			_id: "Cause",
			reasons: this.reasons.map((f) => f.toJSON())
		};
	}
	toString() {
		return `Cause(${format(this.reasons)})`;
	}
	[NodeInspectSymbol]() {
		return this.toJSON();
	}
	[symbol](that) {
		return isCause(that) && this.reasons.length === that.reasons.length && this.reasons.every((e, i) => equals$1(e, that.reasons[i]));
	}
	[symbol$1]() {
		return array(this.reasons);
	}
};
const annotationsMap = /*#__PURE__*/ new WeakMap();
/** @internal */
var ReasonBase = class {
	[CauseReasonTypeId];
	annotations;
	_tag;
	constructor(_tag, annotations, originalError) {
		this[CauseReasonTypeId] = CauseReasonTypeId;
		this._tag = _tag;
		if (annotations !== constEmptyAnnotations && typeof originalError === "object" && originalError !== null && annotations.size > 0) {
			const prevAnnotations = annotationsMap.get(originalError);
			if (prevAnnotations) annotations = new Map([...prevAnnotations, ...annotations]);
			annotationsMap.set(originalError, annotations);
		}
		this.annotations = annotations;
	}
	annotate(annotations, options) {
		if (annotations.mapUnsafe.size === 0) return this;
		const newAnnotations = new Map(this.annotations);
		annotations.mapUnsafe.forEach((value, key) => {
			if (options?.overwrite !== true && newAnnotations.has(key)) return;
			newAnnotations.set(key, value);
		});
		if (options?.overwrite !== true && newAnnotations.size === this.annotations.size) return this;
		const self = Object.assign(Object.create(Object.getPrototypeOf(this)), this);
		self.annotations = newAnnotations;
		return self;
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	toString() {
		return format(this);
	}
	[NodeInspectSymbol]() {
		return this.toString();
	}
};
/** @internal */
const constEmptyAnnotations = /*#__PURE__*/ new Map();
/** @internal */
var Fail = class extends ReasonBase {
	constructor(error, annotations = constEmptyAnnotations) {
		super("Fail", annotations, error);
		this.error = error;
	}
	toString() {
		return `Fail(${format(this.error)})`;
	}
	toJSON() {
		return {
			_tag: "Fail",
			error: this.error
		};
	}
	[symbol](that) {
		return isFailReason(that) && equals$1(this.error, that.error) && equals$1(this.annotations, that.annotations);
	}
	[symbol$1]() {
		return combine(string(this._tag))(combine(hash(this.error))(hash(this.annotations)));
	}
};
/** @internal */
const causeFromReasons = (reasons) => new CauseImpl(reasons);
const dedupeReasons = (self, that) => {
	const buckets = /* @__PURE__ */ new Map();
	const out = [];
	for (const reason of self.concat(that)) {
		const hash$2 = hash(reason);
		const bucket = buckets.get(hash$2);
		if (bucket === void 0) buckets.set(hash$2, [reason]);
		else if (bucket.some((previous) => equals$1(previous, reason))) continue;
		else bucket.push(reason);
		out.push(reason);
	}
	return out;
};
/** @internal */
const causeCombine = /*#__PURE__*/ dual(2, (self, that) => {
	if (self.reasons.length === 0) return that;
	else if (that.reasons.length === 0) return self;
	const newCause = new CauseImpl(dedupeReasons(self.reasons, that.reasons));
	return equals$1(self, newCause) ? self : newCause;
});
/**
* Appends the interrupts from `interrupts` that `self` does not contain yet.
* Unlike `causeCombine`, it never calls hash or equality methods, which can be
* user-defined, random, or throwing.
*
* @internal
*/
const causeAddInterrupts = (self, interrupts) => {
	const reasons = self.reasons.slice();
	for (const reason of interrupts.reasons) if (isInterruptReason(reason) && !reasons.some((r) => isInterruptReason(r) && r.fiberId === reason.fiberId && r.annotations === reason.annotations)) reasons.push(reason);
	return reasons.length === self.reasons.length ? self : new CauseImpl(reasons);
};
/** @internal */
const causeFail = (error) => new CauseImpl([new Fail(error)]);
/** @internal */
var Die = class extends ReasonBase {
	constructor(defect, annotations = constEmptyAnnotations) {
		super("Die", annotations, defect);
		this.defect = defect;
	}
	toString() {
		return `Die(${format(this.defect)})`;
	}
	toJSON() {
		return {
			_tag: "Die",
			defect: this.defect
		};
	}
	[symbol](that) {
		return isDieReason(that) && equals$1(this.defect, that.defect) && equals$1(this.annotations, that.annotations);
	}
	[symbol$1]() {
		return combine(string(this._tag))(combine(hash(this.defect))(hash(this.annotations)));
	}
};
/** @internal */
const causeDie = (defect) => new CauseImpl([new Die(defect)]);
/** @internal */
const causeAnnotate = /*#__PURE__*/ dual((args) => isCause(args[0]), (self, annotations, options) => {
	if (annotations.mapUnsafe.size === 0) return self;
	return new CauseImpl(self.reasons.map((f) => f.annotate(annotations, options)));
});
/** @internal */
const isFailReason = (self) => self._tag === "Fail";
/** @internal */
const isDieReason = (self) => self._tag === "Die";
/** @internal */
const isInterruptReason = (self) => self._tag === "Interrupt";
function defaultEvaluate(_fiber) {
	return exitDie(`Effect.evaluate: Not implemented`);
}
/** @internal */
const makePrimitiveProto = (options) => ({
	...EffectProto,
	[identifier]: options.op,
	[evaluate]: options["~effect/Effect/evaluate"] ?? defaultEvaluate,
	[contA]: options[contA],
	[contE]: options[contE],
	[contAll]: options[contAll]
});
/** @internal */
const makePrimitive = (options) => {
	const Proto = makePrimitiveProto(options);
	const PrimitiveImpl = function(value) {
		this[args] = value;
	};
	PrimitiveImpl.prototype = Proto;
	return function(value) {
		return new PrimitiveImpl(value);
	};
};
/** @internal */
const makeExit = (options) => {
	const Proto = {
		[ExitTypeId]: ExitTypeId,
		_tag: options.op,
		get [options.prop]() {
			return this[args];
		},
		...makePrimitiveProto(options),
		toString() {
			return `${options.op}(${format(this[args])})`;
		},
		toJSON() {
			return {
				_id: "Exit",
				_tag: options.op,
				[options.prop]: this[args]
			};
		},
		[symbol](that) {
			return isExit(that) && that._tag === this._tag && equals$1(this["~effect/Effect/args"], that["~effect/Effect/args"]);
		},
		[symbol$1]() {
			return combine(string(options.op), hash(this[args]));
		}
	};
	const ExitPrimitive = function(value) {
		this[args] = value;
	};
	ExitPrimitive.prototype = Proto;
	return function(value) {
		return new ExitPrimitive(value);
	};
};
/** @internal */
const exitSucceed = /*#__PURE__*/ makeExit({
	op: "Success",
	prop: "value",
	[evaluate](fiber) {
		const cont = fiber.getCont(contA);
		return cont ? cont[contA](this[args], fiber, this) : fiber.yieldWith(this);
	}
});
/** @internal */
const StackTraceKey = { key: "effect/Cause/StackTrace" };
/** @internal */
const InterruptorStackTrace = { key: "effect/Cause/InterruptorStackTrace" };
/** @internal */
const exitFailCause = /*#__PURE__*/ makeExit({
	op: "Failure",
	prop: "cause",
	[evaluate](fiber) {
		let cause = this[args];
		let annotated = false;
		if (fiber.cache.stackFrame) {
			cause = causeAnnotate(cause, { mapUnsafe: /* @__PURE__ */ new Map([[StackTraceKey.key, fiber.cache.stackFrame]]) });
			annotated = true;
		}
		let cont = fiber.getCont(contE);
		const interruptedCause = fiber._interruptedCause;
		if (interruptedCause && fiber.interruptible) {
			let skippedHandler = false;
			while (cont && fiber.interruptible) {
				skippedHandler ||= identifier in cont;
				cont = fiber.getCont(contE);
			}
			if (skippedHandler) cause = causeFromReasons(cause.reasons.filter((reason) => reason._tag !== "Fail"));
			cause = causeAddInterrupts(cause, interruptedCause);
			annotated = true;
		}
		return cont ? cont[contE](cause, fiber, annotated ? void 0 : this) : fiber.yieldWith(annotated ? exitFailCause(cause) : this);
	}
});
/** @internal */
const exitFail = (e) => exitFailCause(causeFail(e));
/** @internal */
const exitDie = (defect) => exitFailCause(causeDie(defect));
/** @internal */
const withFiber = /*#__PURE__*/ makePrimitive({
	op: "WithFiber",
	[evaluate](fiber) {
		return this[args](fiber);
	}
});
/** @internal */
const YieldableError = /*#__PURE__*/ function() {
	class YieldableError extends globalThis.Error {}
	const proto = /*#__PURE__*/ makePrimitiveProto({
		op: "YieldableError",
		[evaluate]() {
			return exitFail(this);
		}
	});
	delete proto.toString;
	Object.assign(YieldableError.prototype, proto);
	return YieldableError;
}();
/** @internal */
const Error$1 = /*#__PURE__*/ function() {
	const plainArgsSymbol = /*#__PURE__*/ Symbol.for("effect/Data/Error/plainArgs");
	return class Base extends YieldableError {
		constructor(args) {
			super(args?.message, args?.cause ? { cause: args.cause } : void 0);
			if (args) {
				assignProperties(this, args);
				Object.defineProperty(this, plainArgsSymbol, {
					value: args,
					enumerable: false
				});
			}
		}
		toJSON() {
			return {
				...this[plainArgsSymbol],
				...this
			};
		}
	};
}();
/** @internal */
const TaggedError$1 = (tag) => {
	class Base extends Error$1 {
		_tag = tag;
	}
	Base.prototype.name = tag;
	return Base;
};
/** @internal */
const NoSuchElementErrorTypeId = "~effect/Cause/NoSuchElementError";
/** @internal */
var NoSuchElementError = class extends (/*#__PURE__*/ TaggedError$1("NoSuchElementError")) {
	[NoSuchElementErrorTypeId] = NoSuchElementErrorTypeId;
	constructor(message) {
		super({ message });
	}
};
/** @internal */
const DoneTypeId = "~effect/Cause/Done";
/** @internal */
const isDone = (u) => hasProperty(u, DoneTypeId);

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Effectable.js
/**
* Create a low-level `Effect` prototype.
*
* **When to use**
*
* Use when you need to create a custom Effect-like value without extending a
* class, by providing a label and an evaluate function that receives the
* current fiber.
*
* **Details**
*
* When the effect is evaluated, it calls `evaluate` with the current fiber.
*
* @see {@link Class} for a class-based approach to defining custom Effect values
* @see {@link Mixin} for wrapping an existing class constructor
*
* @stability stable
* @category prototypes
* @since 4.0.0
*/
const Prototype = (options) => makePrimitiveProto({
	op: options.label,
	[evaluate]: options.evaluate
});

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/option.js
/**
* @since 2.0.0
*/
const TypeId$5 = "~effect/Option";
const CommonProto$1 = {
	[TypeId$5]: { _A: (_) => _ },
	...PipeInspectableProto,
	[Symbol.iterator]() {
		return new SingleShotGen(this);
	}
};
const SomeProto = /*#__PURE__*/ Object.defineProperty(/*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto$1), {
	_tag: "Some",
	_op: "Some",
	[symbol](that) {
		return isOption$1(that) && isSome$1(that) && equals$1(this.value, that.value);
	},
	[symbol$1]() {
		return combine(hash(this._tag))(hash(this.value));
	},
	toString() {
		return `some(${format(this.value)})`;
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag,
			value: toJson(this.value)
		};
	}
}), "valueOrUndefined", { get() {
	return this.value;
} });
const NoneHash = /*#__PURE__*/ hash("None");
const NoneProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto$1), {
	_tag: "None",
	_op: "None",
	valueOrUndefined: void 0,
	[symbol](that) {
		return isOption$1(that) && isNone$1(that);
	},
	[symbol$1]() {
		return NoneHash;
	},
	toString() {
		return `none()`;
	},
	toJSON() {
		return {
			_id: "Option",
			_tag: this._tag
		};
	}
});
/** @internal */
const isOption$1 = (input) => hasProperty(input, TypeId$5);
/** @internal */
const isNone$1 = (fa) => fa._tag === "None";
/** @internal */
const isSome$1 = (fa) => fa._tag === "Some";
/** @internal */
const none$1 = /*#__PURE__*/ Object.create(NoneProto);
/** @internal */
const SomeImpl = function(value) {
	this.value = value;
};
SomeImpl.prototype = SomeProto;
/** @internal */
const some$1 = (value) => new SomeImpl(value);

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/result.js
const TypeId$4 = "~effect/Result";
const CommonProto = {
	[TypeId$4]: {
		/* v8 ignore next 2 */
		_A: (_) => _,
		_E: (_) => _
	},
	...PipeInspectableProto,
	[Symbol.iterator]() {
		return new SingleShotGen(this);
	}
};
const SuccessProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto), {
	_tag: "Success",
	_op: "Success",
	[symbol](that) {
		return isResult(that) && isSuccess$1(that) && equals$1(this.success, that.success);
	},
	[symbol$1]() {
		return combine(hash(this._tag))(hash(this.success));
	},
	toString() {
		return `success(${format(this.success)})`;
	},
	toJSON() {
		return {
			_id: "Result",
			_tag: this._tag,
			value: toJson(this.success)
		};
	}
});
const FailureProto = /*#__PURE__*/ Object.assign(/*#__PURE__*/ Object.create(CommonProto), {
	_tag: "Failure",
	_op: "Failure",
	[symbol](that) {
		return isResult(that) && isFailure$1(that) && equals$1(this.failure, that.failure);
	},
	[symbol$1]() {
		return combine(hash(this._tag))(hash(this.failure));
	},
	toString() {
		return `failure(${format(this.failure)})`;
	},
	toJSON() {
		return {
			_id: "Result",
			_tag: this._tag,
			failure: toJson(this.failure)
		};
	}
});
/** @internal */
const isResult = (input) => hasProperty(input, TypeId$4);
/** @internal */
const isFailure$1 = (result) => result._tag === "Failure";
/** @internal */
const isSuccess$1 = (result) => result._tag === "Success";
/** @internal */
const FailureImpl = function(failure) {
	this.failure = failure;
};
FailureImpl.prototype = FailureProto;
/** @internal */
const fail$3 = (failure) => new FailureImpl(failure);
/** @internal */
const SuccessImpl = function(success) {
	this.success = success;
};
SuccessImpl.prototype = SuccessProto;
/** @internal */
const succeed$4 = (success) => new SuccessImpl(success);
/** @internal */
const getFailure$1 = (self) => isSuccess$1(self) ? none$1 : some$1(self.failure);
/** @internal */
const getSuccess$1 = (self) => isFailure$1(self) ? none$1 : some$1(self.success);
/** @internal */
const fromOption$3 = /*#__PURE__*/ dual(2, (self, onNone) => isNone$1(self) ? fail$3(onNone()) : succeed$4(self.value));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Order.js
/**
* Defines comparison functions for ordered values.
*
* An `Order<A>` compares two `A` values and returns whether the first is less
* than, equal to, or greater than the second. Orders are used for sorting,
* choosing minimum or maximum values, checking ranges, and building ordered data
* structures. This module includes built-in orders, constructors for custom
* orders, tools for reversing and combining comparisons, tuple and struct
* helpers, comparison predicates, clamping, and reducer support.
*
* @stability stable
* @since 2.0.0
*/
/**
* Creates a new `Order` instance from a comparison function.
*
* **When to use**
*
* Use when you need a sorting rule not covered by the built-in orders or input
* mapping helpers, and you can provide a total comparison.
*
* **Details**
*
* Uses reference equality (`===`) as a shortcut: if `self === that`, it returns
* `0` without calling the comparison function. The comparison function should
* return `-1`, `0`, or `1`, and the returned order satisfies total ordering
* laws when the comparison function does.
*
* **Example** (Creating an Order)
*
* ```ts import.meta.vitest
* import { Order } from "effect"
*
* const byAge = Order.make<{ name: string; age: number }>((self, that) => {
*   if (self.age < that.age) return -1
*   if (self.age > that.age) return 1
*   return 0
* })
*
* byAge({ name: "Alice", age: 30 }, { name: "Bob", age: 25 }) // => 1
* byAge({ name: "Alice", age: 25 }, { name: "Bob", age: 30 }) // => -1
* ```
*
* @see {@link mapInput} to transform an order by mapping the input type
* @see {@link combine} to combine multiple orders
* @stability stable
* @category constructors
* @since 2.0.0
*/
function make$3(compare) {
	return (self, that) => self === that ? 0 : compare(self, that);
}
/**
* Order instance for numbers that compares them numerically.
*
* **When to use**
*
* Use when you need numeric ordering for numbers.
*
* **Details**
*
* `0` is considered equal to `-0`. All `NaN` values are considered equal to
* each other, and any `NaN` is considered less than any non-`NaN` number. All
* other values use standard numeric comparison.
*
* **Example** (Ordering numbers)
*
* ```ts import.meta.vitest
* import { Order } from "effect"
*
* Order.Number(1, 1) // => 0
* Order.Number(1, 2) // => -1
* Order.Number(2, 1) // => 1
*
* Order.Number(0, -0) // => 0
* Order.Number(NaN, 1) // => -1
* ```
*
* @see {@link mapInput} to compare objects by a number property
* @see {@link BigInt} for bigint comparisons
* @stability stable
* @category instances
* @since 4.0.0
*/
const Number$1 = /*#__PURE__*/ make$3((self, that) => {
	if (globalThis.Number.isNaN(self) && globalThis.Number.isNaN(that)) return 0;
	if (globalThis.Number.isNaN(self)) return -1;
	if (globalThis.Number.isNaN(that)) return 1;
	return self < that ? -1 : 1;
});
/**
* Transforms an `Order` on type `A` into an `Order` on type `B` by providing a function that
* maps values of type `B` to values of type `A`.
*
* **When to use**
*
* Use when you need to adapt an `Order` to compare a larger value by one
* derived property.
*
* **Details**
*
* Applies the mapping function to both values before comparison. The mapping
* function should be pure and not have side effects so the ordering properties
* of the original order are preserved.
*
* **Example** (Mapping Input)
*
* ```ts import.meta.vitest
* import { Order } from "effect"
*
* const byLength = Order.mapInput(Order.Number, (s: string) => s.length)
*
* byLength("a", "bb") // => -1
* byLength("bb", "a") // => 1
* byLength("aa", "bb") // => 0
* ```
*
* @see {@link combine} to combine mapped orders for multi-criteria comparison
* @see {@link Struct} to create orders for structs with multiple fields
* @stability stable
* @category mapping
* @since 2.0.0
*/
const mapInput = /*#__PURE__*/ dual(2, (self, f) => make$3((b1, b2) => self(f(b1), f(b2))));
/**
* Checks whether one value is strictly greater than another according to the given order.
*
* **When to use**
*
* Use when you need a boolean greater-than predicate using an `Order`.
*
* **Details**
*
* Returns `true` if the order returns `1`, meaning the first value is greater
* than the second. Equal or lesser values return `false`.
*
* **Example** (Checking greater-than comparisons)
*
* ```ts import.meta.vitest
* import { Order } from "effect"
*
* const isGreaterThanNumber = Order.isGreaterThan(Order.Number)
*
* isGreaterThanNumber(2, 1) // => true
* isGreaterThanNumber(1, 2) // => false
* isGreaterThanNumber(1, 1) // => false
* ```
*
* @see {@link isGreaterThanOrEqualTo} for non-strict greater than or equal
* @see {@link isLessThan} for strict less than
* @stability stable
* @category predicates
* @since 4.0.0
*/
const isGreaterThan = (O) => dual(2, (self, that) => O(self, that) === 1);

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Option.js
/**
* Creates an `Option` representing the absence of a value.
*
* **When to use**
*
* Use to represent a missing or uninitialized value, such as returning "no
* result" from a function.
*
* **Details**
*
* - Returns `Option<never>`, which is a subtype of `Option<A>` for any `A`
* - Always returns the same singleton instance
*
* **Example** (Creating an empty Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* //      ┌─── Option<never>
* //      ▼
* const noValue = Option.none() // => Option.none()
* ```
*
* @see {@link some} for the opposite operation.
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const none = () => none$1;
/**
* Wraps the given value into an `Option` to represent its presence.
*
* **When to use**
*
* Use to wrap a known present value as `Option`
* - Returning a successful result from a partial function
*
* **Details**
*
* - Always returns `Some<A>`
* - Does not filter `null` or `undefined`; use {@link fromNullishOr} for that
*
* **Example** (Wrapping a value)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* //      ┌─── Option<number>
* //      ▼
* const value = Option.some(1) // => Option.some(1)
* ```
*
* @see {@link none} for the opposite operation.
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const some = some$1;
/**
* Determines whether the given value is an `Option`.
*
* **When to use**
*
* Use to validate unknown values at runtime boundaries, such as type-narrowing
* in union types.
*
* **Details**
*
* - Returns `true` for both `Some` and `None` instances
* - Acts as a type guard, narrowing the input to `Option<unknown>`
*
* **Example** (Checking if a value is an Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.isOption(Option.some(1)) // => true
* Option.isOption(Option.none()) // => true
* Option.isOption({}) // => false
* ```
*
* @see {@link isNone} to check for `None` specifically
* @see {@link isSome} to check for `Some` specifically
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isOption = isOption$1;
/**
* Checks whether an `Option` is `None` (absent).
*
* **When to use**
*
* Use when you need to branch on an absent `Option` before accessing `.value`.
*
* **Details**
*
* - Acts as a type guard, narrowing to `None<A>`
*
* **Example** (Checking for None)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.isNone(Option.some(1)) // => false
* Option.isNone(Option.none()) // => true
* ```
*
* @see {@link isSome} for the opposite check.
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isNone = isNone$1;
/**
* Checks whether an `Option` contains a value (`Some`).
*
* **When to use**
*
* Use when you need to branch on a present `Option` before accessing `.value`.
*
* **Details**
*
* - Acts as a type guard, narrowing to `Some<A>`
*
* **Example** (Checking for Some)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.isSome(Option.some(1)) // => true
* Option.isSome(Option.none()) // => false
* ```
*
* @see {@link isNone} for the opposite check.
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isSome = isSome$1;
/**
* Pattern-matches on an `Option`, handling both `None` and `Some` cases.
*
* **When to use**
*
* Use when you need to handle both `Some` and `None` in one expression and
* transform an `Option` into a plain value.
*
* **Details**
*
* - If `None`, calls `onNone` and returns its result
* - If `Some`, calls `onSome` with the value and returns its result
* - Supports the `dual` API (data-last and data-first)
*
* **Example** (Matching on an Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.match(Option.some(1), {
*   onNone: () => "Option is empty",
*   onSome: (value) => `Option has a value: ${value}`
* }) // => "Option has a value: 1"
* ```
*
* @see {@link getOrElse} for unwrapping with a default
*
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const match$5 = /*#__PURE__*/ dual(2, (self, { onNone, onSome }) => isNone(self) ? onNone() : onSome(self.value));
/**
* Extracts the value from a `Some`, or evaluates a fallback thunk on `None`.
*
* **When to use**
*
* Use when providing a default value for an absent `Option`
* - Unwrapping with lazy evaluation of the fallback
*
* **Details**
*
* - `Some` → returns the inner value
* - `None` → calls `onNone()` and returns its result
* - `onNone` is only called when needed (lazy)
*
* **Example** (Unwrapping with a fallback)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.some(1).pipe(Option.getOrElse(() => 0)) // => 1
* Option.none().pipe(Option.getOrElse(() => 0)) // => 0
* ```
*
* @see {@link getOrNull} to fall back to `null`
* @see {@link getOrUndefined} to fall back to `undefined`
* @see {@link getOrThrow} to throw on `None`
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const getOrElse$1 = /*#__PURE__*/ dual(2, (self, onNone) => isNone(self) ? onNone() : self.value);
/**
* Returns the fallback `Option` if `self` is `None`; otherwise returns `self`.
*
* **When to use**
*
* Use when you need a lazy fallback `Option`, such as when building priority
* chains of optional values.
*
* **Details**
*
* - `Some` → returns `self` unchanged
* - `None` → evaluates and returns `that()`
* - `that` is lazily evaluated
*
* **Example** (Providing a fallback Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.none().pipe(Option.orElse(() => Option.some("b"))) // => Option.some("b")
* Option.some("a").pipe(Option.orElse(() => Option.some("b"))) // => Option.some("a")
* ```
*
* @see {@link orElseSome} to wrap the fallback value in `Some` automatically
* @see {@link firstSomeOf} to pick the first `Some` from a collection
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const orElse = /*#__PURE__*/ dual(2, (self, that) => isNone(self) ? that() : self);
/**
* Converts a nullable value (`null` or `undefined`) into an `Option`.
*
* **When to use**
*
* Use when you need JavaScript nullish values to become absence at an API
* boundary while all other values, including falsy ones, remain present.
*
* **Details**
*
* - `null` or `undefined` → `None`
* - Any other value → `Some` (typed as `NonNullable<A>`)
*
* **Example** (Converting nullable values to an Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.fromNullishOr(undefined) // => Option.none()
* Option.fromNullishOr(null) // => Option.none()
* Option.fromNullishOr(1) // => Option.some(1)
* ```
*
* @see {@link fromNullOr} to only treat `null` as absent
* @see {@link fromUndefinedOr} to only treat `undefined` as absent
* @see {@link liftNullishOr} to lift a nullable-returning function
*
* @stability stable
* @category converting
* @since 4.0.0
*/
const fromNullishOr = (a) => a == null ? none() : some(a);
/**
* Extracts the value from a `Some`, or returns `null` for `None`.
*
* **When to use**
*
* Use when you need to pass absent `Option` values to APIs that expect `null`.
*
* **Details**
*
* - `Some` → the inner value
* - `None` → `null`
*
* **Example** (Unwrapping to null)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.getOrNull(Option.some(1)) // => 1
* Option.getOrNull(Option.none()) // => null
* ```
*
* @see {@link getOrUndefined} to return `undefined` instead
* @see {@link getOrElse} for a custom fallback
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const getOrNull = /*#__PURE__*/ getOrElse$1(constNull);
/**
* Extracts the value from a `Some`, or returns `undefined` for `None`.
*
* **When to use**
*
* Use when you need to pass absent `Option` values to APIs that expect
* `undefined`.
*
* **Details**
*
* - `Some` → the inner value
* - `None` → `undefined`
*
* **Example** (Unwrapping to undefined)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.getOrUndefined(Option.some(1)) // => 1
* Option.getOrUndefined(Option.none()) // => undefined
* ```
*
* @see {@link getOrNull} to return `null` instead
* @see {@link getOrElse} for a custom fallback
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const getOrUndefined$1 = /*#__PURE__*/ getOrElse$1(constUndefined);
/**
* Transforms the value inside a `Some` using the provided function, leaving
* `None` unchanged.
*
* **When to use**
*
* Use to apply a pure transformation to an `Option`'s present value, especially
* when chaining transformations in a pipeline.
*
* **Details**
*
* - `Some` → applies `f` and wraps the result in a new `Some`
* - `None` → returns `None` unchanged
*
* **Example** (Mapping over an Option)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.map(Option.some(2), (n) => n * 2) // => Option.some(4)
* Option.map(Option.none(), (n: number) => n * 2) // => Option.none()
* ```
*
* @see {@link flatMap} when `f` returns an `Option`
* @see {@link as} to replace the value with a constant
*
* @stability stable
* @category mapping
* @since 2.0.0
*/
const map$3 = /*#__PURE__*/ dual(2, (self, f) => isNone(self) ? none() : some(f(self.value)));
/**
* Applies a function that returns an `Option` to the value of a `Some`,
* flattening the result. Returns `None` if the input is `None`.
*
* **When to use**
*
* Use when you need to chain dependent `Option` computations where each step
* may return `None`.
*
* **Details**
*
* - `Some` → applies `f` to the value and returns its `Option` result
* - `None` → returns `None` without calling `f`
* - Equivalent to `map` followed by {@link flatten}
*
* **Example** (Chaining optional lookups)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* interface User {
*   readonly name: string
*   readonly address: Option.Option<{ readonly street: Option.Option<string> }>
* }
*
* const user: User = {
*   name: "John",
*   address: Option.some({ street: Option.some("123 Main St") })
* }
*
* user.address.pipe(
*   Option.flatMap((addr) => addr.street)
* ) // => Option.some("123 Main St")
* ```
*
* @see {@link map} when `f` returns a plain value
* @see {@link andThen} for a more flexible variant
* @see {@link flatten} to unwrap a nested `Option<Option<A>>`
*
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const flatMap$3 = /*#__PURE__*/ dual(2, (self, f) => isNone(self) ? none() : f(self.value));
/**
* Flattens a nested `Option<Option<A>>` into `Option<A>`.
*
* **When to use**
*
* Use when you need to remove one layer of nested `Option`.
*
* **Details**
*
* - `Some(Some(value))` → `Some(value)`
* - `Some(None)` → `None`
* - `None` → `None`
*
* **Example** (Flattening nested Options)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.flatten(Option.some(Option.some("value"))) // => Option.some("value")
* Option.flatten(Option.some(Option.none())) // => Option.none()
* ```
*
* @see {@link flatMap} which is `map` + `flatten`
*
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const flatten$1 = /*#__PURE__*/ flatMap$3(identity);
/**
* Combines two `Option`s into a `Some` containing a tuple `[A, B]` if both
* are `Some`.
*
* **When to use**
*
* Use when you need to require two `Option` values to both be `Some` and keep
* both values as a tuple.
*
* **Details**
*
* - Both `Some` → `Some([a, b])`
* - Either `None` → `None`
*
* **Example** (Pairing two Options)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.product(Option.some("hello"), Option.some(42)) // => Option.some(["hello", 42])
* Option.product(Option.none(), Option.some(42)) // => Option.none()
* ```
*
* @see {@link zipWith} to combine with a function instead of a tuple
* @see {@link all} to combine many `Option`s
*
* @stability stable
* @category combining
* @since 2.0.0
*/
const product = /*#__PURE__*/ dual(2, (self, that) => isSome(self) && isSome(that) ? some([self.value, that.value]) : none());
/**
* Combines a structure of `Option`s (tuple, struct, or iterable) into a single
* `Option` containing the unwrapped structure.
*
* **When to use**
*
* Use when you need to combine multiple `Option` values into one while
* preserving the input shape, with any `None` making the result `None`.
*
* **Details**
*
* - Tuple input → `Option` of a tuple with the same length
* - Struct input → `Option` of a struct with the same keys
* - Iterable input → `Option` of an `Array`
* - Any `None` in the input → entire result is `None`
*
* **Example** (Combining a tuple and a struct)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* const maybeName: Option.Option<string> = Option.some("John")
* const maybeAge: Option.Option<number> = Option.some(25)
*
* //      ┌─── Option<[string, number]>
* //      ▼
* const tuple = Option.all([maybeName, maybeAge]) // => Option.some(["John", 25])
*
* //      ┌─── Option<{ name: string; age: number; }>
* //      ▼
* const struct = Option.all({ name: maybeName, age: maybeAge }) // => Option.some({ name: "John", age: 25 })
* ```
*
* @see {@link product} for combining exactly two
* @see {@link productMany} for a homogeneous collection
*
* @stability stable
* @category combining
* @since 2.0.0
*/
const all$2 = (input) => {
	if (Symbol.iterator in input) {
		const out = [];
		for (const o of input) {
			if (isNone(o)) return none();
			out.push(o.value);
		}
		return some(out);
	}
	const out = {};
	for (const key of Object.keys(input)) {
		const o = input[key];
		if (isNone(o)) return none();
		assignProperty(out, key, o.value);
	}
	return some(out);
};
/**
* Combines two `Option`s using a provided function.
*
* **When to use**
*
* Use when you need to combine two present `Option` values into a computed
* result.
*
* **Details**
*
* - Both `Some` → applies `f(a, b)` and wraps in `Some`
* - Either `None` → `None`
*
* **Example** (Combining with a function)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.zipWith(
*   Option.some("John"),
*   Option.some(25),
*   (name, age) => ({ name: name.toUpperCase(), age })
* ) // => Option.some({ name: "JOHN", age: 25 })
* ```
*
* @see {@link product} to combine into a tuple instead
* @see {@link lift2} to lift a binary function
*
* @stability stable
* @category zipping
* @since 2.0.0
*/
const zipWith = /*#__PURE__*/ dual(3, (self, that, f) => map$3(product(self, that), ([a, b]) => f(a, b)));
/**
* Converts an `Option` into an `Array`.
*
* **When to use**
*
* Use when you need to pass an `Option` to array-based APIs or spread optional
* values into collections.
*
* **Details**
*
* - `Some` → single-element array `[value]`
* - `None` → empty array `[]`
*
* **Example** (Converting to an array)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.toArray(Option.some(1)) // => [1]
* Option.toArray(Option.none()) // => []
* ```
*
* @see {@link fromIterable} for the inverse direction
*
* @stability stable
* @category converting
* @since 2.0.0
*/
const toArray = (self) => isNone(self) ? [] : [self.value];
/**
* Filters an `Option` using a predicate. Returns `None` if the predicate is
* not satisfied or the input is `None`.
*
* **When to use**
*
* Use when you need to discard an `Option`'s present value when it does not
* meet a condition, while narrowing the type via a refinement predicate.
*
* **Details**
*
* - `None` → `None`
* - `Some` where `predicate(value)` is `true` → `Some(value)`
* - `Some` where `predicate(value)` is `false` → `None`
* - Supports refinements for type narrowing
*
* **Example** (Filtering with a predicate)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* const removeEmpty = (input: Option.Option<string>) =>
*   Option.filter(input, (value) => value !== "")
*
* removeEmpty(Option.some("hello")) // => Option.some("hello")
* removeEmpty(Option.some("")) // => Option.none()
* removeEmpty(Option.none()) // => Option.none()
* ```
*
* @see {@link filterMap} to transform and filter simultaneously
* @see {@link exists} to test without filtering
*
* @stability stable
* @category filtering
* @since 2.0.0
*/
const filter = /*#__PURE__*/ dual(2, (self, predicate) => isNone(self) ? none() : predicate(self.value) ? some(self.value) : none());
/**
* Lifts a `Predicate` or `Refinement` into the `Option` context: returns
* `Some(value)` when the predicate holds, `None` otherwise.
*
* **When to use**
*
* Use to convert a boolean check into an `Option`-returning function
* - Validating input and wrapping it in `Option`
*
* **Details**
*
* - `predicate(value)` is `true` → `Some(value)`
* - `predicate(value)` is `false` → `None`
* - Supports refinements for type narrowing
*
* **Example** (Validating positive numbers)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* const parsePositive = Option.liftPredicate((n: number) => n > 0)
*
* parsePositive(1) // => Option.some(1)
* parsePositive(-1) // => Option.none()
* ```
*
* @see {@link filter} to apply a predicate to an existing `Option`
* @see {@link toRefinement} for the inverse direction
*
* @stability stable
* @category lifting
* @since 2.0.0
*/
const liftPredicate = /*#__PURE__*/ dual(2, (b, predicate) => predicate(b) ? some(b) : none());
/**
* Checks whether an `Option` contains a value equivalent to the given one, using a
* custom `Equivalence`.
*
* **When to use**
*
* Use when you need to test whether an `Option` contains a value using a
* custom equality check.
*
* **Details**
*
* - `Some` where `isEquivalent(value, a)` is `true` → `true`
* - `Some` where not equivalent, or `None` → `false`
*
* **Example** (Checking with custom equivalence)
*
* ```ts import.meta.vitest
* import { Equivalence, Option } from "effect"
*
* const check = Option.containsWith(Equivalence.strictEqual<number>())
*
* Option.some(2).pipe(check(2)) // => true
* Option.some(1).pipe(check(2)) // => false
* Option.none().pipe(check(2)) // => false
* ```
*
* @see {@link contains} for a version using default equality
*
* @stability stable
* @category predicates
* @since 2.0.0
*/
const containsWith = (isEquivalent) => dual(2, (self, a) => isNone(self) ? false : isEquivalent(self.value, a));
/**
* Checks whether an `Option` contains a value equal to the given one, using default
* structural equality.
*
* **When to use**
*
* Use when you need a quick membership test for an `Option` value using
* standard equality.
*
* **Details**
*
* - `Some` where `Equal.equals(value, a)` is `true` → `true`
* - `Some` where not equal, or `None` → `false`
*
* **Example** (Checking containment)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* Option.some(2).pipe(Option.contains(2)) // => true
* Option.some(1).pipe(Option.contains(2)) // => false
* Option.none().pipe(Option.contains(2)) // => false
* ```
*
* @see {@link containsWith} for custom equality
* @see {@link exists} to test with a predicate
*
* @stability stable
* @category predicates
* @since 2.0.0
*/
const contains = /*#__PURE__*/ containsWith(/*#__PURE__*/ asEquivalence());
/**
* Checks whether the value in a `Some` satisfies a predicate or refinement.
*
* **When to use**
*
* Use to check a condition on an optional value without unwrapping
*
* **Details**
*
* - `None` → `false`
* - `Some` where `predicate(value)` is `true` → `true`
* - `Some` where `predicate(value)` is `false` → `false`
* - With a refinement, narrows the `Option` type on `true`
*
* **Example** (Testing a condition)
*
* ```ts import.meta.vitest
* import { Option } from "effect"
*
* const isEven = (n: number) => n % 2 === 0
*
* Option.some(2).pipe(Option.exists(isEven)) // => true
* Option.some(1).pipe(Option.exists(isEven)) // => false
* Option.none().pipe(Option.exists(isEven)) // => false
* ```
*
* @see {@link filter} to keep or discard based on a predicate
* @see {@link contains} to test for a specific value
*
* @stability stable
* @category predicates
* @since 2.0.0
*/
const exists = /*#__PURE__*/ dual(2, (self, refinement) => isNone(self) ? false : refinement(self.value));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Context.js
/**
* Runtime type identifier attached to `Context` service keys and used by
* `isKey` to recognize them.
*
* @stability stable
* @category type IDs
* @since 4.0.0
*/
const ServiceTypeId = "~effect/Context/Service";
/**
* Creates a `Context` service key.
*
* **When to use**
*
* Use when you need to define a context service key for a dependency that must
* be provided by the surrounding context.
*
* **Details**
*
* Call `Context.Service("Key")` for a function-style key, or use the two-stage
* form `Context.Service<Self, Shape>()("Key")` for class-style service
* declarations. The returned key can be yielded as an Effect and passed to
* `Context.make`, `Context.add`, and the Context getter functions.
*
* **Gotchas**
*
* The string key is the runtime identity of the service. Reusing the same key
* string for unrelated services makes them occupy the same slot in a
* `Context`.
*
* **Example** (Creating service keys)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* // Create a simple service
* const Database = Context.Service<{
*   query: (sql: string) => string
* }>("Database")
*
* // Create a service class
* class Config extends Context.Service<Config, {
*   port: number
* }>()("Config") {}
*
* // Use the services to create contexts
* const db = Context.make(Database, {
*   query: (sql) => `Result: ${sql}`
* })
* const config = Context.make(Config, { port: 8080 })
* Context.get(db, Database).query("SELECT 1") // => "Result: SELECT 1"
* Context.get(config, Config).port // => 8080
* ```
*
* @see {@link Reference} for service keys with default values
*
* @stability stable
* @category services
* @since 4.0.0
*/
const Service = function() {
	function KeyClass() {}
	const self = KeyClass;
	Object.setPrototypeOf(self, ServiceProto);
	const init = (key, options) => {
		self.key = key;
		if (options?.defaultValue) {
			self[ReferenceTypeId] = ReferenceTypeId;
			self.defaultValue = options.defaultValue;
		}
		if (options?.make) self.make = options.make;
		if (options?.fiberCached) cacheKeys.add(key);
		return self;
	};
	return arguments.length > 0 ? init(arguments[0], arguments[1]) : init;
};
const ServiceProto = {
	[ServiceTypeId]: ServiceTypeId,
	.../*#__PURE__*/ Prototype({
		label: "Service",
		evaluate(fiber) {
			return exitSucceed(get(fiber.context, this));
		}
	}),
	toJSON() {
		return {
			_id: "Service",
			key: this.key
		};
	},
	of(self) {
		return self;
	},
	context(self) {
		return make$2(this, self);
	},
	use(f) {
		return withFiber((fiber) => f(get(fiber.context, this)));
	},
	useSync(f) {
		return withFiber((fiber) => exitSucceed(f(get(fiber.context, this))));
	}
};
const cacheKeys = /*#__PURE__*/ new Set();
const ReferenceTypeId = "~effect/Context/Reference";
const TypeId$3 = "~effect/Context";
const FlattenAfterBaseHits = 8;
const makeImpl = (cacheRoot, base, overlay, depth, maxDepth) => {
	const self = Object.create(Proto);
	self.cacheRoot = cacheRoot ?? self;
	self.base = base;
	self.overlay = overlay;
	self.depth = depth;
	self._flat = void 0;
	self.baseHits = 0;
	self.maxDepth = maxDepth;
	return self;
};
const applyOverlays = (map, overlay) => {
	if (!overlay) return;
	applyOverlays(map, overlay.parent);
	map.set(overlay.key, overlay.value);
};
const flatten = (self) => {
	if (self._flat) return self._flat;
	if (!self.overlay) return self._flat = self.base;
	const map = new Map(self.base);
	applyOverlays(map, self.overlay);
	return self._flat = map;
};
const withFlat = (self, f) => {
	const map = new Map(self.mapUnsafe);
	f(map);
	return makeImpl(void 0, map, void 0, 0, self.maxDepth);
};
const notFound = /*#__PURE__*/ Symbol();
const lookup = (self, key) => {
	const impl = self;
	for (let overlay = impl.overlay; overlay; overlay = overlay.parent) if (overlay.key === key) return overlay.value;
	const value = impl.base.get(key);
	if (value === void 0 && !impl.base.has(key)) return notFound;
	if (impl.overlay && ++impl.baseHits >= impl.base.size && impl.baseHits >= FlattenAfterBaseHits) {
		impl.base = flatten(impl);
		impl.overlay = void 0;
		impl.depth = 0;
	}
	return value;
};
/**
* Creates a `Context` from an existing service map.
*
* **When to use**
*
* Use when constructing a low-level `Context` from a trusted map whose lifecycle
* you control.
*
* **Details**
*
* `options.maxDepth` sets how many `add` calls are kept as overlays before the
* context is rebased into a flat map (default `8`). Lower values make lookups
* cheaper, higher values make additions to a large base cheaper. Invalid
* values fall back to the default.
*
* Contexts derived with `add`, `pick`, `omit`, and `merge` keep the setting
* (`merge` from its first non-empty argument). `make`, `empty`, and `mergeAll`
* use the default. Layers are combined with `mergeAll`, so apply it to the
* final context rather than inside a layer.
*
* **Gotchas**
*
* Excessively large `maxDepth` values can cause stack overflow when overlays
* are materialized or rebased. Choose a modest value.
*
* The provided map is retained without copying and must not be mutated after
* construction. Prefer `empty`, `make`, `add`, or `merge` for normal Context
* construction.
*
* **Example** (Creating a context from a map)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* // Create a context from a Map (unsafe)
* const map = new Map([
*   ["Logger", { log: (_msg: string) => {} }]
* ])
*
* const context = Context.makeUnsafe(map)
* context.mapUnsafe.size // => 1
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const makeUnsafe$2 = (mapUnsafe, options) => {
	const maxDepth = options?.maxDepth;
	return makeImpl(void 0, mapUnsafe, void 0, 0, Number.isInteger(maxDepth) && maxDepth >= 0 ? maxDepth : 8);
};
const Proto = {
	get mapUnsafe() {
		return flatten(this);
	},
	...PipeInspectableProto,
	[TypeId$3]: { _Services: (_) => _ },
	toJSON() {
		return {
			_id: "Context",
			services: Array.from(this.mapUnsafe).map(([key, value]) => ({
				key,
				value
			}))
		};
	},
	[symbol](that) {
		if (!isContext(that)) return false;
		const self = this.mapUnsafe;
		const other = that.mapUnsafe;
		if (self.size !== other.size) return false;
		for (const [key, value] of self) if (!other.has(key) || !equals$1(value, other.get(key))) return false;
		return true;
	},
	[symbol$1]() {
		return number(this.mapUnsafe.size);
	}
};
/** @internal */
const hasSameCache = (self, that) => self.cacheRoot === that.cacheRoot;
/**
* Checks whether the provided argument is a `Context`.
*
* **When to use**
*
* Use to narrow an unknown value before passing it to APIs that require a
* `Context`.
*
* **Details**
*
* This checks the runtime `Context` marker and does not inspect which services
* the context contains.
*
* **Gotchas**
*
* This guard only proves that the value is a `Context`; it does not prove that
* any specific service is present.
*
* **Example** (Checking for contexts)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
* Context.isContext(Context.empty()) // => true
* ```
*
* @see {@link isKey} for checking service keys
* @see {@link isReference} for checking references with defaults
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isContext = (u) => hasProperty(u, TypeId$3);
/**
* Checks whether the provided argument is a `Reference`.
*
* **Example** (Checking for references)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* const LoggerRef = Context.Reference("Logger", {
*   defaultValue: () => ({ log: (_msg: string) => {} })
* })
*
* Context.isReference(LoggerRef) // => true
* Context.isReference(Context.Service("Key")) // => false
* ```
*
* @stability stable
* @category guards
* @since 3.11.0
*/
const isReference = (u) => !!u[ReferenceTypeId];
/**
* Returns an empty `Context`.
*
* **Example** (Creating an empty context)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
* Context.empty().mapUnsafe.size // => 0
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const empty$1 = () => emptyContext;
const emptyContext = /*#__PURE__*/ makeUnsafe$2(/*#__PURE__*/ new Map());
/**
* Creates a new `Context` with a single service associated to the key.
*
* **Example** (Creating a context with one service)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
*
* const context = Context.make(Port, { PORT: 8080 })
*
* Context.get(context, Port).PORT // => 8080
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const make$2 = (key, service) => makeUnsafe$2(/* @__PURE__ */ new Map([[key.key, service]]));
/**
* Adds a service to a given `Context`.
*
* **When to use**
*
* Use when you need to store a known service value in a `Context`.
*
* **Details**
*
* If the context already contains the same service key, the new service
* replaces the previous one.
*
* **Example** (Adding a service to a context)
*
* ```ts import.meta.vitest
* import { Context, pipe } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
* const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
*
* const someContext = Context.make(Port, { PORT: 8080 })
*
* const context = pipe(
*   someContext,
*   Context.add(Timeout, { TIMEOUT: 5000 })
* )
*
* const values = [Context.get(context, Port).PORT, Context.get(context, Timeout).TIMEOUT]
* values // => [8080, 5000]
* ```
*
* @see {@link addOrOmit} for adding or removing a service from an `Option`
*
* @stability stable
* @category combining
* @since 2.0.0
*/
const add = /*#__PURE__*/ dual(3, (self, key, service) => addUnsafe(self, key.key, service));
/**
* Adds a service by key to a given `Context` using a string key.
*
* @stability stable
* @category combining
* @since 4.0.0
*/
const addUnsafe = (self, key, service) => {
	const impl = self;
	const cacheRoot = cacheKeys.has(key) ? void 0 : impl.cacheRoot;
	if (impl.depth >= impl.maxDepth) {
		const map = new Map(impl._flat ?? impl.base);
		if (!impl._flat) applyOverlays(map, impl.overlay);
		map.set(key, service);
		return makeImpl(cacheRoot, map, void 0, 0, impl.maxDepth);
	}
	return makeImpl(cacheRoot, impl.base, {
		key,
		value: service,
		parent: impl.overlay
	}, impl.depth + 1, impl.maxDepth);
};
/**
* Returns the service currently stored for a key, or `undefined` when the key
* is absent.
*
* **When to use**
*
* Use when you need to read the service stored for a key without resolving
* `Context.Reference` defaults.
*
* **Gotchas**
*
* This is a raw lookup and does not resolve default values for
* `Context.Reference` keys.
*
* @see {@link getOption} for a reference-aware optional lookup
*
* @stability stable
* @category getters
* @since 4.0.0
*/
const getOrUndefined = /*#__PURE__*/ dual(2, (self, key) => getOrUndefinedUnsafe(self, key.key));
/** @internal */
const getOrUndefinedUnsafe = (self, key) => {
	const value = lookup(self, key);
	return value === notFound ? void 0 : value;
};
/**
* Gets the service for a key, throwing if an absent non-reference key cannot be
* resolved.
*
* **When to use**
*
* Use when you need to read a service from a context whose type does not prove
* the service is present.
*
* **Details**
*
* If the key is a `Context.Reference` and no override is stored in the
* context, its cached default value is returned. For absent non-reference keys,
* this function throws a runtime error.
*
* **Example** (Getting services unsafely)
*
* ```ts import.meta.vitest
* import { Context, Option } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
* const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
*
* const context = Context.make(Port, { PORT: 8080 })
*
* Context.getUnsafe(context, Port).PORT // => 8080
* Context.getOption(context, Timeout) // => Option.none()
* ```
*
* @see {@link get} for type-checked service access
* @see {@link getOption} for optional service access
*
* @stability stable
* @category unsafe
* @since 4.0.0
*/
const getUnsafe = /*#__PURE__*/ dual(2, (self, service) => {
	const value = lookup(self, service.key);
	if (value === notFound) {
		if (isReference(service)) return getDefaultValue(service);
		throw serviceNotFoundError(service);
	}
	return value;
});
/**
* Gets a service from the context that corresponds to the given key.
*
* **When to use**
*
* Use when you need type-checked access to a service already included in the
* context type.
*
* **Example** (Getting a service from a context)
*
* ```ts import.meta.vitest
* import { Context, pipe } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
* const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
*
* const context = pipe(
*   Context.make(Port, { PORT: 8080 }),
*   Context.add(Timeout, { TIMEOUT: 5000 })
* )
*
* Context.get(context, Timeout).TIMEOUT // => 5000
* ```
*
* @see {@link getOption} for optional service access
* @see {@link getOrElse} for fallback values
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const get = getUnsafe;
const defaultValueCacheKey = "~effect/Context/defaultValue";
const getDefaultValue = (ref) => {
	if (defaultValueCacheKey in ref) return ref[defaultValueCacheKey];
	return ref[defaultValueCacheKey] = ref.defaultValue();
};
const serviceNotFoundError = (service) => {
	const error = /* @__PURE__ */ new Error(`Service not found${service.key ? `: ${String(service.key)}` : ""}`);
	if (error.stack) {
		const lines = error.stack.split("\n");
		lines.splice(1, 3);
		error.stack = lines.join("\n");
	}
	return error;
};
/**
* Merges two `Context`s into one.
*
* **When to use**
*
* Use when you need to combine two contexts.
*
* **Details**
*
* When both contexts contain the same service key, the service from `that`
* overrides the service from `self`.
*
* **Example** (Merging two contexts)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
* const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
*
* const firstContext = Context.make(Port, { PORT: 8080 })
* const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })
*
* const context = Context.merge(firstContext, secondContext)
*
* const values = [Context.get(context, Port).PORT, Context.get(context, Timeout).TIMEOUT]
* values // => [8080, 5000]
* ```
*
* @see {@link mergeAll} for merging more than two contexts at once
*
* @stability stable
* @category combining
* @since 2.0.0
*/
const merge = /*#__PURE__*/ dual(2, (self, that) => {
	if (self.mapUnsafe.size === 0) return that;
	if (that.mapUnsafe.size === 0) return self;
	return withFlat(self, (map) => that.mapUnsafe.forEach((value, key) => map.set(key, value)));
});
/**
* Merges any number of `Context`s into one.
*
* **When to use**
*
* Use when you need to combine a variadic list of contexts.
*
* **Details**
*
* When multiple contexts contain the same service key, the service from the
* last context with that key is kept.
*
* **Example** (Merging multiple contexts)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* const Port = Context.Service<{ PORT: number }>("Port")
* const Timeout = Context.Service<{ TIMEOUT: number }>("Timeout")
* const Host = Context.Service<{ HOST: string }>("Host")
*
* const firstContext = Context.make(Port, { PORT: 8080 })
* const secondContext = Context.make(Timeout, { TIMEOUT: 5000 })
* const thirdContext = Context.make(Host, { HOST: "localhost" })
*
* const context = Context.mergeAll(
*   firstContext,
*   secondContext,
*   thirdContext
* )
*
* context.mapUnsafe.size // => 3
* ```
*
* @see {@link merge} for merging two contexts
*
* @stability stable
* @category combining
* @since 3.12.0
*/
const mergeAll$1 = (...ctxs) => {
	const map = /* @__PURE__ */ new Map();
	for (let i = 0; i < ctxs.length; i++) ctxs[i].mapUnsafe.forEach((value, key) => {
		map.set(key, value);
	});
	return makeUnsafe$2(map);
};
/**
* Creates a context key with a default value.
*
* **When to use**
*
* Use when you need to define a context key with a lazily computed default
* value.
*
* **Details**
*
* `Context.Reference` allows you to create a key that can hold a value. You
* can provide a default value for the service, which will automatically be used
* when the context is accessed, or override it with a custom implementation
* when needed. The default value is computed lazily and cached on the
* reference.
*
* **Example** (Creating references with default values)
*
* ```ts import.meta.vitest
* import { Context } from "effect"
*
* // Create a reference with a default value
* const messages: Array<string> = []
* const LoggerRef = Context.Reference("Logger", {
*   defaultValue: () => ({ log: (msg: string) => messages.push(`Default: ${msg}`) })
* })
*
* // The reference provides the default value when accessed from an empty context
* const context = Context.empty()
* const logger = Context.get(context, LoggerRef)
*
* // You can also override the default value
* const customContext = Context.make(LoggerRef, {
*   log: (msg: string) => messages.push(`Custom: ${msg}`)
* })
* const customLogger = Context.get(customContext, LoggerRef)
* logger.log("default")
* customLogger.log("message")
* messages // => ["Default: default", "Custom: message"]
* ```
*
* @see {@link Service} for required services without default values
*
* @stability stable
* @category services
* @since 3.11.0
*/
const Reference = Service;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Result.js
/**
* Creates a `Result` holding a `Success` value.
*
* **Details**
*
* - Use when you have a value and want to lift it into the `Result` type
* - The error type `E` defaults to `never`
*
* **Example** (Wrapping a value)
*
* ```ts import.meta.vitest
* import { Result } from "effect"
*
* Result.succeed(42) // => Result.succeed(42)
* ```
*
* @see {@link fail} to create a Failure
* @see {@link void_ void} for a pre-built `Success<void>`
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const succeed$3 = succeed$4;
/**
* Creates a `Result` holding a `Failure` value.
*
* **When to use**
*
* Use to represent a failed `Result` with a typed failure value.
*
* **Details**
*
* - The success type `A` defaults to `never`
*
* **Example** (Creating a failure)
*
* ```ts import.meta.vitest
* import { Result } from "effect"
*
* Result.fail("Something went wrong") // => Result.fail("Something went wrong")
* ```
*
* @see {@link succeed} to create a Success
* @see {@link mapError} to transform the error
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const fail$2 = fail$3;
/**
* Converts an `Option<A>` into a `Result<A, E>`.
*
* **When to use**
*
* Use when an existing `Option` should become a `Result`, preserving `Some` as
* success and turning `None` into a caller-provided failure.
*
* **Details**
*
* - `Some<A>` becomes `Success<A>`
* - `None` becomes `Failure<E>` using the provided function
* - Supports both data-first and data-last (piped) usage
*
* **Example** (Converting an Option to a Result)
*
* ```ts import.meta.vitest
* import { Option, Result } from "effect"
*
* Result.fromOption(Option.some(1), () => "missing") // => Result.succeed(1)
*
* Result.fromOption(Option.none(), () => "missing") // => Result.fail("missing")
* ```
*
* @see {@link getSuccess} to extract the success value as an Option
* @see {@link getFailure} to extract the failure value as an Option
* @see {@link fromNullishOr} to build a Result from nullable values
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const fromOption$2 = fromOption$3;
const try_ = (evaluate) => {
	if (isFunction(evaluate)) try {
		return succeed$3(evaluate());
	} catch (e) {
		return fail$2(e);
	}
	else try {
		return succeed$3(evaluate.try());
	} catch (e) {
		return fail$2(evaluate.catch(e));
	}
};
/**
* Checks whether a `Result` is a `Failure`.
*
* **When to use**
*
* Use to narrow a known `Result` to the `Failure` variant.
*
* **Details**
*
* - Acts as a TypeScript type guard, narrowing to `Failure<A, E>`
* - After narrowing, you can access `.failure` to read the error value
*
* **Example** (Narrowing to failure)
*
* ```ts import.meta.vitest
* import { Result } from "effect"
*
* const result = Result.fail("oops")
*
* if (Result.isFailure(result)) {
*   result.failure // => "oops"
* }
* ```
*
* @see {@link isSuccess} for the opposite check
* @see {@link isResult} to check if a value is any Result
*
* @stability stable
* @category guards
* @since 4.0.0
*/
const isFailure = isFailure$1;
/**
* Checks whether a `Result` is a `Success`.
*
* **When to use**
*
* Use to narrow a known `Result` to the `Success` variant.
*
* **Details**
*
* - Acts as a TypeScript type guard, narrowing to `Success<A, E>`
* - After narrowing, you can access `.success` to read the value
*
* **Example** (Narrowing to success)
*
* ```ts import.meta.vitest
* import { Result } from "effect"
*
* const result = Result.succeed(42)
*
* if (Result.isSuccess(result)) {
*   result.success // => 42
* }
* ```
*
* @see {@link isFailure} for the opposite check
* @see {@link isResult} to check if a value is any Result
*
* @stability stable
* @category guards
* @since 4.0.0
*/
const isSuccess = isSuccess$1;
/**
* Extracts the success value as an `Option`, discarding the failure.
*
* **When to use**
*
* Use when you need to extract the success value from a `Result` as an
* `Option` and discard failure information.
*
* **Details**
*
* - `Success<A>` becomes `Some<A>`
* - `Failure<E>` becomes `None`
*
* **Example** (Extracting the success as an Option)
*
* ```ts import.meta.vitest
* import { Option, Result } from "effect"
*
* Result.getSuccess(Result.succeed("ok")) // => Option.some("ok")
*
* Result.getSuccess(Result.fail("err")) // => Option.none()
* ```
*
* @see {@link getFailure} to extract the error instead
* @see {@link fromOption} for the reverse conversion
*
* @stability stable
* @category getters
* @since 4.0.0
*/
const getSuccess = getSuccess$1;
/**
* Extracts the failure value as an `Option`, discarding the success.
*
* **When to use**
*
* Use when you need to extract the failure value from a `Result` as an
* `Option` and discard successful values.
*
* **Details**
*
* - `Failure<E>` becomes `Some<E>`
* - `Success<A>` becomes `None`
*
* **Example** (Extracting the failure as an Option)
*
* ```ts import.meta.vitest
* import { Option, Result } from "effect"
*
* Result.getFailure(Result.succeed("ok")) // => Option.none()
*
* Result.getFailure(Result.fail("err")) // => Option.some("err")
* ```
*
* @see {@link getSuccess} to extract the success instead
* @see {@link fromOption} for the reverse conversion
*
* @stability stable
* @category getters
* @since 4.0.0
*/
const getFailure = getFailure$1;
/**
* Transforms the failure channel of a `Result`, leaving the success channel unchanged.
*
* **When to use**
*
* Use to transform only the failure channel while preserving success values.
*
* **Details**
*
* - If the result is a `Failure`, applies `f` to the error and returns a new `Failure`
* - If the result is a `Success`, returns it as-is
*
* **Example** (Adding context to an error)
*
* ```ts import.meta.vitest
* import { pipe, Result } from "effect"
*
* pipe(
*   Result.fail("not found"),
*   Result.mapError((e) => `Error: ${e}`)
* ) // => Result.fail("Error: not found")
* ```
*
* @see {@link map} to transform only the success value
* @see {@link mapBoth} to transform both channels
*
* @stability stable
* @category mapping
* @since 4.0.0
*/
const mapError$2 = /*#__PURE__*/ dual(2, (self, f) => isFailure(self) ? fail$2(f(self.failure)) : self);
/**
* Transforms the success channel of a `Result`, leaving the failure channel unchanged.
*
* **When to use**
*
* Use to apply a transformation to the success value of a `Result` while
* preserving any existing failure.
*
* **Details**
*
* - If the result is a `Success`, applies `f` to the value and returns a new `Success`
* - If the result is a `Failure`, returns it as-is
* - Use {@link flatMap} if `f` returns a `Result` (to avoid nested Results)
*
* **Example** (Doubling the success value)
*
* ```ts import.meta.vitest
* import { pipe, Result } from "effect"
*
* pipe(
*   Result.succeed(3),
*   Result.map((n) => n * 2)
* ) // => Result.succeed(6)
* ```
*
* @see {@link mapError} to transform only the error value
* @see {@link mapBoth} to transform both channels
* @see {@link flatMap} when `f` returns a `Result`
*
* @stability stable
* @category mapping
* @since 2.0.0
*/
const map$2 = /*#__PURE__*/ dual(2, (self, f) => isSuccess(self) ? succeed$3(f(self.success)) : self);
/**
* Folds a `Result` into a single value by applying one of two functions.
*
* **When to use**
*
* Use when a `Result`'s success and failure branches should be collapsed into
* one plain output type.
*
* **Details**
*
* - Applies `onSuccess` if the result is a `Success`
* - Applies `onFailure` if the result is a `Failure`
* - Both branches must return the same type (or a common supertype)
*
* **Example** (Folding to a string)
*
* ```ts import.meta.vitest
* import { pipe, Result } from "effect"
*
* const format = Result.match({
*   onSuccess: (n: number) => `Got ${n}`,
*   onFailure: (e: string) => `Err: ${e}`
* })
*
* format(Result.succeed(42)) // => "Got 42"
*
* format(Result.fail("timeout")) // => "Err: timeout"
* ```
*
* @see {@link merge} to extract `A | E` without mapping
* @see {@link getOrElse} to unwrap only the success with a fallback
*
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const match$4 = /*#__PURE__*/ dual(2, (self, { onFailure, onSuccess }) => isFailure(self) ? onFailure(self.failure) : onSuccess(self.success));
/**
* Extracts the success value, or computes a fallback from the error.
*
* **When to use**
*
* Use when you need the success value from a `Result`, with a fallback computed
* from the failure value.
*
* **Details**
*
* - `Success<A>` returns the inner value
* - `Failure<E>` applies `onFailure` to the error and returns the result
* - The return type is `A | A2` (union of both branches)
*
* **Example** (Providing a fallback)
*
* ```ts import.meta.vitest
* import { Result } from "effect"
*
* Result.getOrElse(Result.succeed(1), () => 0) // => 1
*
* Result.getOrElse(Result.fail("err"), () => 0) // => 0
* ```
*
* @see {@link getOrNull} / {@link getOrUndefined} for simpler fallbacks
* @see {@link getOrThrow} to throw on failure
* @see {@link match} to map both branches
* @see {@link orElse} to recover with another Result instead of unwrapping
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const getOrElse = /*#__PURE__*/ dual(2, (self, onFailure) => isFailure(self) ? onFailure(self.failure) : self.success);
/**
* Chains a function that returns a `Result` onto a successful value.
*
* **When to use**
*
* Use to sequence `Result`-returning computations that should short-circuit on
* failure.
*
* **Details**
*
* - If `self` is a `Success`, applies `f` to the value and returns the resulting `Result`
* - If `self` is a `Failure`, short-circuits and returns it unchanged
* - The error types are merged into a union (`E | E2`)
* - This is the monadic `bind` / `>>=` for `Result`
*
* **Example** (Validating sequentially)
*
* ```ts import.meta.vitest
* import { pipe, Result } from "effect"
*
* pipe(
*   Result.succeed(5),
*   Result.flatMap((n) =>
*     n > 0 ? Result.succeed(n * 2) : Result.fail("not positive")
*   )
* ) // => Result.succeed(10)
* ```
*
* @see {@link andThen} for a more flexible variant that also accepts plain values
* @see {@link map} when `f` does not return a `Result`
*
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const flatMap$2 = /*#__PURE__*/ dual(2, (self, f) => isFailure(self) ? fail$2(self.failure) : f(self.success));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Array.js
/**
* Exposes the global array constructor.
*
* **When to use**
*
* Use to access native JavaScript array constructor methods such as `isArray`
* or `from` from the Effect module namespace.
*
* **Example** (Accessing the Array constructor)
*
* ```ts import.meta.vitest
* import { Array } from "effect"
*
* Array.Array === globalThis.Array // => true
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const Array$1 = globalThis.Array;
/**
* Converts an `Iterable` to an `Array`.
*
* **When to use**
*
* Use to convert any `Iterable` (Set, Generator, etc.) into an array.
*
* **Details**
*
* If the input is already an array, this returns it by reference without
* copying. Otherwise, it creates a new array from the iterable. Use `copy` if
* you need a fresh array even when the input is already an array.
*
* **Example** (Converting a Set to an array)
*
* ```ts import.meta.vitest
* import { Array } from "effect"
*
* Array.fromIterable(new Set([1, 2, 3])) // => [1, 2, 3]
* ```
*
* @see {@link ensure} — wrap a single value or return an existing array
* @see {@link copy} — create a shallow copy of an array
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const fromIterable = (collection) => Array$1.isArray(collection) ? collection : Array$1.from(collection);
/**
* Checks whether a value is an `Array`.
*
* **When to use**
*
* Use to verify a value is a mutable array, narrowing its type to `Array<unknown>`.
*
* **Details**
*
* Acts as a type guard narrowing the input to `Array<unknown>` and delegates to
* `globalThis.Array.isArray`.
*
* **Example** (Type-guarding an unknown value)
*
* ```ts import.meta.vitest
* import { Array } from "effect"
*
* Array.isArray(null) // => false
* Array.isArray([1, 2, 3]) // => true
* ```
*
* @see {@link isArrayEmpty} — check for an empty array
* @see {@link isArrayNonEmpty} — check for a non-empty array
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isArray = Array$1.isArray;
/**
* Creates an empty array.
*
* **When to use**
*
* Use to create a typed empty array without allocating placeholder elements.
*
* **Example** (Creating an empty array)
*
* ```ts import.meta.vitest
* import { Array } from "effect"
*
* Array.empty<number>() // => []
* ```
*
* @see {@link of} — create a single-element array
* @see {@link make} — create from multiple values
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const empty = () => [];

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Duration.js
const TypeId$2 = "~effect/Duration";
const bigint0$1 = /*#__PURE__*/ BigInt(0);
const bigint1 = /*#__PURE__*/ BigInt(1);
const bigint2 = /*#__PURE__*/ BigInt(2);
const bigint10 = /*#__PURE__*/ BigInt(10);
const bigint1e3 = /*#__PURE__*/ BigInt(1e3);
const bigint1e6 = /*#__PURE__*/ BigInt(1e6);
const bigint1e9 = /*#__PURE__*/ BigInt(1e9);
const bigintNanosPerMinute = /*#__PURE__*/ BigInt(6e10);
const bigintNanosPerHour = /*#__PURE__*/ BigInt(36e11);
const bigintNanosPerDay = /*#__PURE__*/ BigInt(864e11);
const bigintNanosPerWeek = /*#__PURE__*/ BigInt(6048e11);
const roundTiesAwayFromZero = (input) => BigInt(Math.sign(input) * Math.round(Math.abs(input)));
const roundMillisToNanos = (millis) => Number.isInteger(millis) ? BigInt(millis) * bigint1e6 : roundTiesAwayFromZero(millis * 1e6);
const fromNanosNumber = (nanos) => make$1(Number.isFinite(nanos) ? roundTiesAwayFromZero(nanos) : nanos);
const nanosToUnit = (nanos, divisor) => {
	const value = Number(nanos);
	if (Number.isFinite(value)) return value / divisor;
	const scale = BigInt(divisor);
	return Number(nanos / scale) + Number(nanos % scale) / divisor;
};
const parseNanos = (input, scale) => {
	const decimalIndex = input.indexOf(".");
	if (decimalIndex === -1) return BigInt(input) * scale;
	const isNegative = input[0] === "-";
	const fractional = input.slice(decimalIndex + 1);
	const fractionalScale = bigint10 ** BigInt(fractional.length);
	const scaled = (BigInt(input.slice(isNegative ? 1 : 0, decimalIndex)) * fractionalScale + BigInt(fractional)) * scale;
	return divideTiesAwayFromZero(isNegative ? -scaled : scaled, fractionalScale);
};
const divideTiesAwayFromZero = (numerator, denominator) => {
	const absolute = numerator < bigint0$1 ? -numerator : numerator;
	const rounded = absolute / denominator + (absolute % denominator * bigint2 >= denominator ? bigint1 : bigint0$1);
	return numerator < bigint0$1 ? -rounded : rounded;
};
const fromMillisString = (input, scale) => {
	const millis = Number(input) * scale;
	if (!Number.isFinite(millis)) return make$1(millis);
	const nanos = parseNanos(input, BigInt(scale) * bigint1e6);
	return make$1(Number.isInteger(millis) && BigInt(millis) * bigint1e6 === nanos ? millis : nanos);
};
const DURATION_REGEXP = /^(-?\d+(?:\.\d+)?)\s+(nanos?|micros?|millis?|seconds?|minutes?|hours?|days?|weeks?)$/;
/**
* Decodes a `Duration.Input` into a `Duration`.
*
* **When to use**
*
* Use when the input has already been validated or comes from a trusted source
* and throwing is acceptable for invalid duration syntax.
*
* **Gotchas**
*
* If the input is not a valid `Duration.Input`, it throws an error.
*
* **Example** (Decoding duration inputs)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.fromInputUnsafe(1000) // => Duration.millis(1000)
* Duration.fromInputUnsafe("5 seconds") // => Duration.seconds(5)
* Duration.fromInputUnsafe("Infinity") // => Duration.infinity
* Duration.fromInputUnsafe([2, 500_000_000]) // => Duration.nanos(2_500_000_000n)
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const fromInputUnsafe = (input) => {
	switch (typeof input) {
		case "number": return millis(input);
		case "bigint": return nanos(input);
		case "string": {
			if (input === "Infinity") return infinity;
			if (input === "-Infinity") return negativeInfinity;
			const match = DURATION_REGEXP.exec(input);
			if (!match) break;
			const [_, valueStr, unit] = match;
			if (unit === "nano" || unit === "nanos") return nanos(parseNanos(valueStr, bigint1));
			if (unit === "micro" || unit === "micros") return nanos(parseNanos(valueStr, bigint1e3));
			switch (unit) {
				case "milli":
				case "millis": return fromMillisString(valueStr, 1);
				case "second":
				case "seconds": return fromMillisString(valueStr, 1e3);
				case "minute":
				case "minutes": return fromMillisString(valueStr, 6e4);
				case "hour":
				case "hours": return fromMillisString(valueStr, 36e5);
				case "day":
				case "days": return fromMillisString(valueStr, 864e5);
				case "week":
				case "weeks": return fromMillisString(valueStr, 6048e5);
			}
			break;
		}
		case "object": {
			if (input === null) break;
			if (TypeId$2 in input) return input;
			if (Array.isArray(input)) {
				if (input.length !== 2 || !input.every(isNumber)) return invalid(input);
				if (Number.isNaN(input[0]) || Number.isNaN(input[1])) return zero;
				if (input[0] === -Infinity || input[1] === -Infinity) return negativeInfinity;
				if (input[0] === Infinity || input[1] === Infinity) return infinity;
				const nanos = input[0] * 1e9 + input[1];
				return Number.isFinite(nanos) && Number.isInteger(input[0]) && Number.isInteger(input[1]) ? make$1(BigInt(input[0]) * bigint1e9 + BigInt(input[1])) : fromNanosNumber(nanos);
			}
			const obj = input;
			let millis = 0;
			if (obj.weeks) millis += obj.weeks * 6048e5;
			if (obj.days) millis += obj.days * 864e5;
			if (obj.hours) millis += obj.hours * 36e5;
			if (obj.minutes) millis += obj.minutes * 6e4;
			if (obj.seconds) millis += obj.seconds * 1e3;
			if (obj.milliseconds) millis += obj.milliseconds;
			if (!obj.microseconds && !obj.nanoseconds) {
				if (!Number.isFinite(millis)) return make$1(millis);
				const exact = sumObjectNanos(obj);
				return exact === void 0 || BigInt(millis) * bigint1e6 === exact ? make$1(millis) : make$1(exact);
			}
			const nanos = millis * 1e6 + (obj.microseconds ?? 0) * 1e3 + (obj.nanoseconds ?? 0);
			const exact = Number.isFinite(nanos) ? sumObjectNanos(obj) : void 0;
			return exact === void 0 ? fromNanosNumber(nanos) : make$1(exact);
		}
	}
	return invalid(input);
};
const isIntegerOrUnset = (n) => !n || Number.isInteger(n);
const sumObjectNanos = (obj) => {
	if (!isIntegerOrUnset(obj.weeks) || !isIntegerOrUnset(obj.days) || !isIntegerOrUnset(obj.hours) || !isIntegerOrUnset(obj.minutes) || !isIntegerOrUnset(obj.seconds) || !isIntegerOrUnset(obj.milliseconds) || !isIntegerOrUnset(obj.microseconds) || !isIntegerOrUnset(obj.nanoseconds)) return void 0;
	let nanos = bigint0$1;
	if (obj.weeks) nanos += BigInt(obj.weeks) * bigintNanosPerWeek;
	if (obj.days) nanos += BigInt(obj.days) * bigintNanosPerDay;
	if (obj.hours) nanos += BigInt(obj.hours) * bigintNanosPerHour;
	if (obj.minutes) nanos += BigInt(obj.minutes) * bigintNanosPerMinute;
	if (obj.seconds) nanos += BigInt(obj.seconds) * bigint1e9;
	if (obj.milliseconds) nanos += BigInt(obj.milliseconds) * bigint1e6;
	if (obj.microseconds) nanos += BigInt(obj.microseconds) * bigint1e3;
	if (obj.nanoseconds) nanos += BigInt(obj.nanoseconds);
	return nanos;
};
const invalid = (input) => {
	throw new Error(`Invalid Input: ${input}`);
};
const zeroDurationValue = {
	_tag: "Millis",
	millis: 0
};
const infinityDurationValue = { _tag: "Infinity" };
const negativeInfinityDurationValue = { _tag: "NegativeInfinity" };
const DurationProto = {
	[TypeId$2]: TypeId$2,
	[symbol$1]() {
		switch (this.value._tag) {
			case "Millis": return hash(roundMillisToNanos(this.value.millis));
			case "Nanos": return hash(this.value.nanos);
			default: return structure(this.value);
		}
	},
	[symbol](that) {
		return isDuration(that) && equals(this, that);
	},
	toString() {
		switch (this.value._tag) {
			case "Infinity": return "Infinity";
			case "NegativeInfinity": return "-Infinity";
			case "Nanos": return `${this.value.nanos} nanos`;
			case "Millis": return `${this.value.millis} millis`;
		}
	},
	toJSON() {
		switch (this.value._tag) {
			case "Millis": return {
				_id: "Duration",
				_tag: "Millis",
				millis: this.value.millis
			};
			case "Nanos": return {
				_id: "Duration",
				_tag: "Nanos",
				nanos: String(this.value.nanos)
			};
			case "Infinity": return {
				_id: "Duration",
				_tag: "Infinity"
			};
			case "NegativeInfinity": return {
				_id: "Duration",
				_tag: "NegativeInfinity"
			};
		}
	},
	[NodeInspectSymbol]() {
		return this.toJSON();
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const make$1 = (input) => {
	const duration = Object.create(DurationProto);
	if (typeof input === "number") {
		if (isNaN(input) || input === 0 || Object.is(input, -0)) duration.value = zeroDurationValue;
		else if (!Number.isFinite(input)) duration.value = input > 0 ? infinityDurationValue : negativeInfinityDurationValue;
		else if (!Number.isInteger(input)) duration.value = {
			_tag: "Nanos",
			nanos: roundMillisToNanos(input)
		};
		else duration.value = {
			_tag: "Millis",
			millis: input
		};
	} else if (input === bigint0$1) duration.value = zeroDurationValue;
	else duration.value = {
		_tag: "Nanos",
		nanos: input
	};
	return duration;
};
/**
* Checks whether a value is a Duration.
*
* **Example** (Checking for durations)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.isDuration(Duration.seconds(1)) // => true
* Duration.isDuration(1000) // => false
* ```
*
* @stability stable
* @category guards
* @since 2.0.0
*/
const isDuration = (u) => hasProperty(u, TypeId$2);
/**
* A Duration representing zero time.
*
* **Example** (Referencing the zero duration)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toMillis(Duration.zero) // => 0
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const zero = /*#__PURE__*/ make$1(0);
/**
* A Duration representing infinite time.
*
* **Example** (Referencing infinite duration)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toMillis(Duration.infinity) // => Infinity
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const infinity = /*#__PURE__*/ make$1(Infinity);
/**
* A Duration representing negative infinite time.
*
* **Example** (Referencing negative infinite duration)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toMillis(Duration.negativeInfinity) // => -Infinity
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const negativeInfinity = /*#__PURE__*/ make$1(-Infinity);
/**
* Creates a Duration from nanoseconds.
*
* **Example** (Creating durations from nanoseconds)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.nanos(500_000_000n) // => Duration.nanos(500_000_000n)
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const nanos = (nanos) => make$1(nanos);
/**
* Creates a Duration from milliseconds.
*
* **Example** (Creating durations from milliseconds)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toMillis(Duration.millis(1000)) // => 1000
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const millis = (millis) => make$1(millis);
/**
* Converts a Duration to milliseconds.
*
* **Example** (Converting durations to milliseconds)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toMillis(Duration.seconds(5)) // => 5000
* Duration.toMillis(Duration.minutes(2)) // => 120_000
* ```
*
* @stability stable
* @category getters
* @since 2.0.0
*/
const toMillis = (self) => match$3(fromInputUnsafe(self), {
	onMillis: identity,
	onNanos: (nanos) => nanosToUnit(nanos, 1e6),
	onInfinity: () => Infinity,
	onNegativeInfinity: () => -Infinity
});
/**
* Gets the duration in nanoseconds as a bigint.
*
* **When to use**
*
* Use when the duration is known to be finite and you need the nanosecond value
* as a `bigint`.
*
* **Details**
*
* Millisecond-backed fractional durations are rounded to the nearest
* nanosecond, with ties away from zero.
*
* **Gotchas**
*
* If the duration is infinite, it throws an error.
*
* **Example** (Reading nanoseconds unsafely)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.toNanosUnsafe(Duration.seconds(2)) // => 2_000_000_000n
*
* // Duration.toNanosUnsafe(Duration.infinity)
* // throws Error: "Cannot convert infinite duration to nanos"
* ```
*
* @stability stable
* @category getters
* @since 4.0.0
*/
const toNanosUnsafe = (input) => {
	const self = fromInputUnsafe(input);
	switch (self.value._tag) {
		case "Infinity":
		case "NegativeInfinity": throw new Error("Cannot convert infinite duration to nanos");
		case "Nanos": return self.value.nanos;
		case "Millis": return roundMillisToNanos(self.value.millis);
	}
};
/**
* Pattern matches on the representation of a `Duration`.
*
* **Details**
*
* Provide handlers for millisecond-backed values, nanosecond-backed values,
* and positive infinity. Use `onNegativeInfinity` to handle negative infinity
* separately; otherwise negative infinity is handled by `onInfinity`.
*
* **Example** (Pattern matching on duration representations)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.match(Duration.seconds(5), {
*   onMillis: (millis) => `${millis} milliseconds`,
*   onNanos: (nanos) => `${nanos} nanoseconds`,
*   onInfinity: () => "infinite"
* }) // => "5000 milliseconds"
* ```
*
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const match$3 = /*#__PURE__*/ dual(2, (self, options) => {
	switch (self.value._tag) {
		case "Millis": return options.onMillis(self.value.millis);
		case "Nanos": return options.onNanos(self.value.nanos);
		case "Infinity": return options.onInfinity();
		case "NegativeInfinity": return (options.onNegativeInfinity ?? options.onInfinity)();
	}
});
/**
* Pattern matches on two `Duration`s, providing handlers that receive both values.
*
* **Example** (Pattern matching on duration pairs)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.matchPair(Duration.seconds(3), Duration.seconds(2), {
*   onMillis: (a, b) => a + b,
*   onNanos: (a, b) => Number(a + b),
*   onInfinity: () => Infinity
* }) // => 5000
* ```
*
* @stability stable
* @category pattern matching
* @since 4.0.0
*/
const matchPair = /*#__PURE__*/ dual(3, (self, that, options) => {
	if (self.value._tag === "Infinity" || self.value._tag === "NegativeInfinity" || that.value._tag === "Infinity" || that.value._tag === "NegativeInfinity") return options.onInfinity(self, that);
	if (self.value._tag === "Millis") return that.value._tag === "Millis" ? options.onMillis(self.value.millis, that.value.millis) : options.onNanos(toNanosUnsafe(self), that.value.nanos);
	else return options.onNanos(self.value.nanos, toNanosUnsafe(that));
});
/**
* Provides an `Equivalence` instance for comparing `Duration` values.
*
* **Example** (Comparing durations for equivalence)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.Equivalence(Duration.seconds(5), Duration.millis(5000)) // => true
* ```
*
* @stability stable
* @category instances
* @since 2.0.0
*/
const Equivalence = (self, that) => matchPair(self, that, {
	onMillis: (self, that) => self === that,
	onNanos: (self, that) => self === that,
	onInfinity: (self, that) => self.value._tag === that.value._tag
});
/**
* Checks whether two Durations are equal.
*
* **Example** (Checking duration equality)
*
* ```ts import.meta.vitest
* import { Duration } from "effect"
*
* Duration.equals(Duration.seconds(5), Duration.millis(5000)) // => true
* ```
*
* @stability stable
* @category predicates
* @since 2.0.0
*/
const equals = /*#__PURE__*/ dual(2, (self, that) => Equivalence(self, that));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Scheduler.js
/**
* Controls how runnable Effect fiber tasks are dispatched.
*
* A scheduler decides how tasks are queued, when queued tasks run, and when a
* fiber should pause so other work can continue. This module includes the
* scheduler service reference, the default `MixedScheduler`, dispatcher types
* for queued tasks, and references for tuning or disabling automatic scheduler
* yields.
*
* @stability stable
* @since 2.0.0
*/
/**
* Context reference for the scheduler used by the Effect runtime.
*
* **When to use**
*
* Use when you need to replace scheduling behavior globally in tests or runtime
* setup, such as forcing deterministic task dispatch.
*
* **Details**
*
* The default value creates a `MixedScheduler`. Provide this service to
* customize execution mode, task dispatching, or yield behavior.
*
* @stability stable
* @category services
* @since 2.0.0
*/
const Scheduler = /*#__PURE__*/ Reference("effect/Scheduler", {
	fiberCached: true,
	defaultValue: () => new MixedScheduler()
});
const setMicrotask = (f) => {
	let cancelled = false;
	Promise.resolve().then(() => {
		if (!cancelled) f();
	});
	return () => {
		cancelled = true;
	};
};
const setTimer = "setImmediate" in globalThis ? (f) => {
	const timer = globalThis.setImmediate(f);
	return () => globalThis.clearImmediate(timer);
} : (f) => {
	const timer = setTimeout(f, 0);
	return () => clearTimeout(timer);
};
const setImmediate = (f) => {
	try {
		return setTimer(f);
	} catch {
		return setMicrotask(f);
	}
};
var PriorityBuckets = class {
	buckets = [];
	scheduleTask(task, priority) {
		const buckets = this.buckets;
		const len = buckets.length;
		let bucket;
		let index = 0;
		for (; index < len; index++) {
			if (buckets[index][0] > priority) break;
			bucket = buckets[index];
		}
		if (bucket && bucket[0] === priority) bucket[1].push(task);
		else if (index === len) buckets.push([priority, [task]]);
		else buckets.splice(index, 0, [priority, [task]]);
	}
	drain() {
		const buckets = this.buckets;
		this.buckets = [];
		return buckets;
	}
};
/**
* Provides a scheduler implementation that batches queued tasks and dispatches them by
* priority.
*
* **When to use**
*
* Use when you need the default runtime scheduler directly, including a
* scheduler that batches queued work by priority and preserves FIFO order within
* each priority.
*
* **Details**
*
* `MixedScheduler` supports synchronous and asynchronous execution modes, uses
* operation counts to decide when fibers should yield, and is the default
* scheduler implementation.
*
* **Gotchas**
*
* On Cloudflare Workers, request-owned scheduler timers can be discarded,
* leaving shared fibers suspended. Use `new MixedScheduler("sync")` for the
* whole application; see `HttpRouter.toWebHandler` for a recipe.
* Sync mode does not yield to the event loop: CPU-heavy work delays other
* requests, and I/O-polling loops can exhaust the CPU limit. It does not fix
* request-owned timers (such as `Effect.sleep`) or request-bound async contexts.
*
* @stability stable
* @category models
* @since 2.0.0
*/
var MixedScheduler = class {
	executionMode;
	setImmediate;
	constructor(executionMode = "async", setImmediateFn) {
		this.executionMode = executionMode;
		this.setImmediate = setImmediateFn ?? (executionMode === "sync" ? setMicrotask : setImmediate);
	}
	/**
	* Returns whether the fiber has reached its operation budget and should yield.
	*
	* **When to use**
	*
	* Use to decide whether a fiber should yield after consuming its current
	* operation budget.
	*
	* @since 2.0.0
	*/
	shouldYield(fiber) {
		return fiber.currentOpCount >= fiber.cache.maxOpsBeforeYield;
	}
	/**
	* Creates a dispatcher that schedules work through this scheduler.
	*
	* **When to use**
	*
	* Use when you need a standalone dispatcher from a scheduler instance, for
	* example in tests that enqueue tasks and then flush them deterministically.
	*
	* @since 4.0.0
	*/
	makeDispatcher() {
		return new MixedSchedulerDispatcher(this.setImmediate);
	}
};
var MixedSchedulerDispatcher = class {
	tasks = /*#__PURE__*/ new PriorityBuckets();
	running = void 0;
	setImmediate;
	constructor(setImmediateFn = setImmediate) {
		this.setImmediate = setImmediateFn;
	}
	/**
	* @since 2.0.0
	*/
	scheduleTask(task, priority) {
		this.tasks.scheduleTask(task, priority);
		if (this.running === void 0) this.running = this.setImmediate(this.afterScheduled);
	}
	/**
	* @since 2.0.0
	*/
	afterScheduled = () => {
		this.running = void 0;
		this.runTasks();
	};
	/**
	* @since 2.0.0
	*/
	runTasks() {
		const buckets = this.tasks.drain();
		for (let i = 0; i < buckets.length; i++) {
			const toRun = buckets[i][1];
			for (let j = 0; j < toRun.length; j++) toRun[j]();
		}
	}
	/**
	* @since 2.0.0
	*/
	flush() {
		while (this.tasks.buckets.length > 0) {
			if (this.running !== void 0) {
				this.running();
				this.running = void 0;
			}
			this.runTasks();
		}
	}
};
/**
* Context reference that controls the maximum number of operations a fiber
* can perform before yielding control back to the scheduler.
*
* **When to use**
*
* Use to tune scheduler fairness for CPU-bound fibers by changing the scheduler
* operation budget that triggers a yield.
*
* **Details**
*
* The default value is `2048` operations, which balances performance and
* fairness by helping prevent long-running fibers from monopolizing the
* execution thread.
*
* @see {@link PreventSchedulerYield} for bypassing scheduler yield checks entirely rather than tuning the operation budget
*
* @stability stable
* @category services
* @since 4.0.0
*/
const MaxOpsBeforeYield = /*#__PURE__*/ Reference("effect/Scheduler/MaxOpsBeforeYield", {
	fiberCached: true,
	defaultValue: () => 2048
});
/**
* Context reference that controls whether the runtime should bypass scheduler
* yield checks. When set to `true`, the fiber run loop won't call
* `Scheduler.shouldYield`.
*
* **When to use**
*
* Use to bypass scheduler yield checks for controlled runtime workloads where
* cooperative yielding should be disabled.
*
* **Gotchas**
*
* Setting this reference to `true` can let long-running fibers monopolize the
* JavaScript thread.
*
* @see {@link MaxOpsBeforeYield} for tuning yield frequency without disabling yield checks
* @see {@link Scheduler} for providing custom scheduler yield behavior
*
* @stability stable
* @category services
* @since 4.0.0
*/
const PreventSchedulerYield = /*#__PURE__*/ Reference("effect/Scheduler/PreventSchedulerYield", {
	fiberCached: true,
	defaultValue: () => false
});

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Data.js
/**
* Provides a base class for immutable data types.
*
* **When to use**
*
* Use when you need a lightweight immutable value type with `.pipe()` support.
*
* **Details**
*
* Extend `Class` with a type parameter to declare fields. The constructor
* accepts those fields as a single object argument. When there are no fields
* the argument is optional. Instances are `Readonly` and `Pipeable`.
*
* **Example** (Defining a value class)
*
* ```ts import.meta.vitest
* import { Data, Equal } from "effect"
*
* class Person extends Data.Class<{ readonly name: string }> {}
*
* Equal.equals(new Person({ name: "Mike" }), new Person({ name: "Mike" })) // => true
* ```
*
* @see {@link TaggedClass} — adds a `_tag` field
* @see {@link Error} — yieldable error variant
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const Class = class extends Class$1 {
	constructor(props) {
		super();
		if (props) assignProperties(this, props);
	}
};
/**
* Creates a tagged error class with a `_tag` discriminator.
*
* **When to use**
*
* Use when you need domain errors with discriminated-union handling.
*
* **Details**
*
* Like {@link Error}, but instances also carry a `readonly _tag` property,
* enabling `Effect.catchTag` and `Effect.catchTags` for tag-based recovery.
* The `_tag` is excluded from the constructor argument. Yielding an instance
* inside `Effect.gen` fails the effect with this error.
*
* **Example** (Recovering by tag)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class NotFound extends Data.TaggedError("NotFound")<{
*   readonly resource: string
* }> {}
*
* class Forbidden extends Data.TaggedError("Forbidden")<{
*   readonly reason: string
* }> {}
*
* const program = Effect.gen(function*() {
*   return yield* new NotFound({ resource: "/users/42" })
* })
*
* const recovered = program.pipe(
*   Effect.catchTag("NotFound", (e) =>
*     Effect.succeed(`missing: ${e.resource}`))
* )
*
* await Effect.runPromise(recovered) // => "missing: /users/42"
* ```
*
* @see {@link Error} — without a `_tag`
* @see {@link TaggedClass} — tagged class that is not an error
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const TaggedError = TaggedError$1;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/encoding/Hex.js
/**
* Generates a random lowercase hexadecimal string, optimized for lengths that
* are multiples of 8.
*
* **Details**
*
* `length` is not validated. The function generates `length >>> 3` random
* 8-character words, so non-negative lengths below `2 ** 32` are rounded down
* to a multiple of 8 and other values follow JavaScript's unsigned 32-bit
* coercion rules.
*
* This function uses `Math.random()` and is not cryptographically secure. For
* security-sensitive values, draw bytes with the `randomBytes` method of the
* `SecureRandom` service from `effect/crypto/SecureRandom`, and encode them with
* {@link encode}.
*
* @stability stable
* @category encoding
* @since 4.0.0
*/
const random = (length) => {
	switch (length) {
		case 16: return random16();
		case 32: return random32();
		default: {
			let result = "";
			for (let i = length >>> 3; i > 0; i--) result += random8();
			return result;
		}
	}
};
const hexCharCodes = /*#__PURE__*/ Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0));
const randomWord = () => Math.random() * 4294967296 >>> 0;
const random8 = () => {
	const a = randomWord();
	return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15]);
};
const random16 = () => {
	const a = randomWord();
	const b = randomWord();
	return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15], hexCharCodes[b >>> 28], hexCharCodes[b >>> 24 & 15], hexCharCodes[b >>> 20 & 15], hexCharCodes[b >>> 16 & 15], hexCharCodes[b >>> 12 & 15], hexCharCodes[b >>> 8 & 15], hexCharCodes[b >>> 4 & 15], hexCharCodes[b & 15]);
};
const random32 = () => {
	const a = randomWord();
	const b = randomWord();
	const c = randomWord();
	const d = randomWord();
	return String.fromCharCode(hexCharCodes[a >>> 28], hexCharCodes[a >>> 24 & 15], hexCharCodes[a >>> 20 & 15], hexCharCodes[a >>> 16 & 15], hexCharCodes[a >>> 12 & 15], hexCharCodes[a >>> 8 & 15], hexCharCodes[a >>> 4 & 15], hexCharCodes[a & 15], hexCharCodes[b >>> 28], hexCharCodes[b >>> 24 & 15], hexCharCodes[b >>> 20 & 15], hexCharCodes[b >>> 16 & 15], hexCharCodes[b >>> 12 & 15], hexCharCodes[b >>> 8 & 15], hexCharCodes[b >>> 4 & 15], hexCharCodes[b & 15], hexCharCodes[c >>> 28], hexCharCodes[c >>> 24 & 15], hexCharCodes[c >>> 20 & 15], hexCharCodes[c >>> 16 & 15], hexCharCodes[c >>> 12 & 15], hexCharCodes[c >>> 8 & 15], hexCharCodes[c >>> 4 & 15], hexCharCodes[c & 15], hexCharCodes[d >>> 28], hexCharCodes[d >>> 24 & 15], hexCharCodes[d >>> 20 & 15], hexCharCodes[d >>> 16 & 15], hexCharCodes[d >>> 12 & 15], hexCharCodes[d >>> 8 & 15], hexCharCodes[d >>> 4 & 15], hexCharCodes[d & 15]);
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Tracer.js
/**
* Defines the low-level tracing model used by Effect.
*
* A span records the lifetime of an operation, including its name, parent,
* attributes, links, annotations, sampling decision, kind, and completion
* status. The module also defines the tracer service, parent-span context,
* external span support, trace propagation settings, and the default in-memory
* span implementation.
*
* @stability stable
* @since 2.0.0
*/
/**
* Defines the string key for the parent-span context service.
*
* **When to use**
*
* Use when you need the raw context key for parent span lookup in lower-level
* tracing code.
*
* **Example** (Reading the parent span key)
*
* ```ts import.meta.vitest
* import { Tracer } from "effect"
*
* // The key used to identify parent spans in the context
* Tracer.ParentSpanKey // => "effect/Tracer/ParentSpan"
* ```
*
* @stability stable
* @category constants
* @since 4.0.0
*/
const ParentSpanKey = "effect/Tracer/ParentSpan";
/**
* Context service containing the `Span` or `ExternalSpan` to use as the parent
* of newly-created child spans.
*
* **Example** (Accessing the parent span)
*
* ```ts import.meta.vitest
* import { Effect, Tracer } from "effect"
*
* // Access the parent span from the context
* const program = Effect.gen(function*() {
*   const parentSpan = yield* Effect.service(Tracer.ParentSpan)
*   return parentSpan.spanId
* })
*
* const parent = Tracer.externalSpan({ spanId: "span-123", traceId: "trace-456" })
* await Effect.runPromise(Effect.provideService(program, Tracer.ParentSpan, parent)) // => "span-123"
* ```
*
* @stability stable
* @category services
* @since 2.0.0
*/
var ParentSpan = class extends (/*#__PURE__*/ Service()(ParentSpanKey, { fiberCached: true })) {};
/**
* Creates a `Tracer` value from a tracer implementation object.
*
* **When to use**
*
* Use to create a custom tracing backend value that Effect can use when
* creating spans.
*
* **Details**
*
* `make` returns the supplied implementation object unchanged. The object must
* satisfy the `Tracer` contract, including a `span` method that returns a
* `Span`.
*
* @see {@link Span} for the span values returned by tracer implementations
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const make = (options) => options;
/**
* Context reference for disabling trace propagation.
*
* **When to use**
*
* Use to prevent spans in a scope from propagating tracing context.
*
* **Details**
*
* When enabled on fiber or span annotations, new spans are created as
* non-propagating no-op spans and disabled spans are skipped when deriving a
* parent span.
*
* **Example** (Disabling span propagation)
*
* ```ts import.meta.vitest
* import { Effect, Tracer } from "effect"
*
* // Disable span propagation for a specific effect
* const program = Tracer.DisablePropagation.pipe(
*   Effect.provideService(Tracer.DisablePropagation, true)
* )
*
* await Effect.runPromise(program) // => true
* ```
*
* @stability stable
* @category services
* @since 3.12.0
*/
const DisablePropagation = /*#__PURE__*/ Reference("effect/Tracer/DisablePropagation", { defaultValue: constFalse });
/**
* Context reference for controlling the current trace level for dynamic filtering.
*
* **When to use**
*
* Use to set the default trace level for spans in a scope when span options do
* not provide `level`.
*
* **Details**
*
* The default value is `"Info"`. Span creation uses `options.level ??
* CurrentTraceLevel` before applying `MinimumTraceLevel`.
*
* @see {@link MinimumTraceLevel} for the threshold that decides whether spans at that level are sampled
*
* @stability stable
* @category services
* @since 4.0.0
*/
const CurrentTraceLevel = /*#__PURE__*/ Reference("effect/Tracer/CurrentTraceLevel", { defaultValue: () => "Info" });
/**
* Context reference for setting the minimum trace level threshold. Spans and their
* descendants below this level will have their sampling decision forced to
* false, preventing them from being exported.
*
* **When to use**
*
* Use to set the trace-level threshold that controls whether spans are sampled
* by default.
*
* **Details**
*
* The default value is `"All"`. Span creation compares the span level from
* `options.level ?? CurrentTraceLevel` against this threshold.
*
* **Gotchas**
*
* Explicit `options.sampled` bypasses threshold computation.
*
* @see {@link CurrentTraceLevel} for the default span level used when options do not specify one
*
* @stability stable
* @category services
* @since 4.0.0
*/
const MinimumTraceLevel = /*#__PURE__*/ Reference("effect/Tracer/MinimumTraceLevel", { defaultValue: () => "All" });
/**
* Defines the string key for the active tracer context reference.
*
* **When to use**
*
* Use when you need the raw context key for active tracer lookup in lower-level
* tracing code.
*
* @stability stable
* @category constants
* @since 4.0.0
*/
const TracerKey = "effect/Tracer";
/**
* The default `Tracer` implementation backing the `Tracer` reference. It
* creates in-memory `NativeSpan` instances and does not export them anywhere.
*
* **Details**
*
* Runtime code can compare the active tracer against `nativeTracer` to detect
* that no tracing backend is installed and skip work that only a backend could
* observe, such as recording span attributes.
*
* @stability stable
* @category references
* @since 4.0.0
*/
const nativeTracer = /*#__PURE__*/ make({ span: (options) => new NativeSpan(options) });
/**
* Default in-memory `Span` implementation used by the native tracer. It
* generates span and trace identifiers, stores attributes, events, and links,
* and records `Started` or `Ended` status.
*
* **Details**
*
* The constructor initializes the span with `Started` status. Trace and span
* identifiers, the attribute map, and the event list are created lazily on
* first access, so spans that are never inspected allocate as little as
* possible. Attributes, events, links, and status are mutated through `Span`
* methods. Once the span has ended, those methods do nothing, so a second `end`
* keeps the original end time and exit.
*
* @see {@link Span} for the interface implemented by native spans
*
* @stability stable
* @category models
* @since 4.0.0
*/
var NativeSpan = class {
	_tag = "Span";
	sampled;
	name;
	parent;
	annotations;
	links;
	startTime;
	kind;
	status;
	_traceId = void 0;
	_spanId = void 0;
	_attributes = void 0;
	_events = void 0;
	constructor(options) {
		this.name = options.name;
		this.parent = options.parent;
		this.annotations = options.annotations;
		this.links = options.links;
		this.startTime = options.startTime;
		this.kind = options.kind;
		this.sampled = options.sampled;
		this.status = {
			_tag: "Started",
			startTime: options.startTime
		};
	}
	get traceId() {
		return this._traceId ??= getOrUndefined$1(this.parent)?.traceId ?? random(32);
	}
	get spanId() {
		return this._spanId ??= random(16);
	}
	get attributes() {
		return this._attributes ??= /* @__PURE__ */ new Map();
	}
	get events() {
		return this._events ??= [];
	}
	end(endTime, exit) {
		if (this.status._tag === "Ended") return;
		this.status = {
			_tag: "Ended",
			endTime,
			exit,
			startTime: this.status.startTime
		};
	}
	attribute(key, value) {
		if (this.status._tag === "Ended") return;
		this.attributes.set(key, value);
	}
	event(name, startTime, attributes) {
		if (this.status._tag === "Ended") return;
		this.events.push([
			name,
			startTime,
			attributes ?? {}
		]);
	}
	addLinks(links) {
		if (this.status._tag === "Ended") return;
		this.links.push(...links);
	}
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/metric.js
/** @internal */
const FiberRuntimeMetricsKey = "effect/Metric/FiberRuntimeMetrics";

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/references.js
/** @internal */
const CurrentStackFrame = /*#__PURE__*/ Reference("effect/References/CurrentStackFrame", {
	fiberCached: true,
	defaultValue: constUndefined
});
/** @internal */
const TracerEnabled = /*#__PURE__*/ Reference("effect/References/TracerEnabled", {
	fiberCached: true,
	defaultValue: constTrue
});
/** @internal */
const TracerTimingEnabled = /*#__PURE__*/ Reference("effect/References/TracerTimingEnabled", { defaultValue: constTrue });
/** @internal */
const TracerSpanAnnotations = /*#__PURE__*/ Reference("effect/References/TracerSpanAnnotations", { defaultValue: () => ({}) });
/** @internal */
const TracerSpanLinks = /*#__PURE__*/ Reference("effect/References/TracerSpanLinks", { defaultValue: () => [] });
/** @internal */
const CurrentLogLevel = /*#__PURE__*/ Reference("effect/References/CurrentLogLevel", {
	fiberCached: true,
	defaultValue: () => "Info"
});
/** @internal */
const MinimumLogLevel = /*#__PURE__*/ Reference("effect/References/MinimumLogLevel", {
	fiberCached: true,
	defaultValue: () => "Info"
});

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/tracer.js
/** @internal */
const makeStackCleaner = (line) => (stack) => {
	let cache;
	return () => {
		if (cache !== void 0) return cache;
		const trace = stack();
		if (!trace) return void 0;
		const lines = trace.split("\n");
		if (lines[line] !== void 0) {
			cache = lines[line].trim();
			return cache;
		}
	};
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/effect.js
/** @internal */
var Interrupt = class extends ReasonBase {
	constructor(fiberId, annotations = constEmptyAnnotations) {
		super("Interrupt", annotations, "Interrupted");
		this.fiberId = fiberId;
	}
	toString() {
		return `Interrupt(${this.fiberId})`;
	}
	toJSON() {
		return {
			_tag: "Interrupt",
			fiberId: this.fiberId
		};
	}
	[symbol](that) {
		return isInterruptReason(that) && this.fiberId === that.fiberId && this.annotations === that.annotations;
	}
	[symbol$1]() {
		return string(`${this._tag}:${this.fiberId}`);
	}
};
/** @internal */
const causeInterrupt = (fiberId) => new CauseImpl([new Interrupt(fiberId)]);
/** @internal */
const hasFails = (self) => self.reasons.some(isFailReason);
/** @internal */
const findError = (self) => {
	for (let i = 0; i < self.reasons.length; i++) {
		const reason = self.reasons[i];
		if (reason._tag === "Fail") return succeed$3(reason.error);
	}
	return fail$2(self);
};
/** @internal */
const hasDies = (self) => self.reasons.some(isDieReason);
/**
* Defects take precedence over typed failures when causes are combined: if
* the cause contains a `Die`, every `Fail` becomes a `Die`. `Done` signals
* stay typed so pulls still complete.
*
* @internal
*/
const causeElectDefects = (self) => hasDies(self) && hasFails(self) ? causeFromReasons(self.reasons.map((reason) => reason._tag === "Fail" && !isDone(reason.error) ? new Die(reason.error, reason.annotations) : reason)) : self;
/**
* Selects the first typed error unless a defect is present, in which case
* every `Fail` is elected to `Die`. Interrupts do not block typed recovery.
*
* @internal
*/
const findRecoverableError = (self) => hasDies(self) ? fail$2(causeElectDefects(self)) : findError(self);
/** @internal */
const findDefect = (self) => {
	const reason = self.reasons.find(isDieReason);
	return reason ? succeed$3(reason.defect) : fail$2(self);
};
/** @internal */
const hasInterrupts = (self) => self.reasons.some(isInterruptReason);
/** @internal */
const causeMap = /*#__PURE__*/ dual(2, (self, f) => {
	let hasFail = false;
	const failures = self.reasons.map((failure) => {
		if (isFailReason(failure)) {
			hasFail = true;
			return new Fail(f(failure.error), failure.annotations);
		}
		return failure;
	});
	return hasFail ? causeFromReasons(failures) : self;
});
/** @internal */
const causePrettyErrors = (self, options) => {
	const errors = [];
	const interrupts = [];
	if (self.reasons.length === 0) return errors;
	const prevStackLimit = getStackTraceLimit();
	if (prevStackLimit !== 0) setStackTraceLimit(1);
	try {
		for (const failure of self.reasons) {
			if (failure._tag === "Interrupt") {
				interrupts.push(failure);
				continue;
			}
			errors.push(causePrettyError(failure._tag === "Die" ? failure.defect : failure.error, failure.annotations, options));
		}
		if (errors.length === 0) {
			const cause = /* @__PURE__ */ new Error("The fiber was interrupted by:");
			cause.name = "InterruptCause";
			cause.stack = interruptCauseStack(cause, interrupts);
			const error = new globalThis.Error("All fibers interrupted without error", { cause });
			error.name = "InterruptError";
			error.stack = `${error.name}: ${error.message}`;
			errors.push(causePrettyError(error, interrupts[0].annotations, options));
		}
	} finally {
		if (prevStackLimit !== 0) setStackTraceLimit(prevStackLimit);
	}
	return errors;
};
/** @internal */
const causePrettyError = (original, annotations, options, seen = /* @__PURE__ */ new Set()) => {
	const kind = typeof original;
	let error;
	if (original && kind === "object") {
		seen.add(original);
		const cause = original.cause;
		error = new globalThis.Error(causePrettyMessage(original), { cause: cause !== void 0 && !seen.has(cause) ? causePrettyError(cause, void 0, void 0, seen) : void 0 });
		if (typeof original.name === "string") error.name = original.name;
		if (typeof original.stack === "string") error.stack = cleanErrorStack(original.stack, error, annotations);
		else {
			const stack = `${error.name}: ${error.message}`;
			error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
		}
		if (options?.includeCauseInStack) error.stack = renderPrettyError(error);
		for (const key of Object.keys(original)) if (!(key in error)) error[key] = original[key];
	} else {
		error = new globalThis.Error(!original ? `Unknown error: ${original}` : kind === "string" ? original : formatJson(original));
		const stack = `${error.name}: ${error.message}`;
		error.stack = annotations ? addStackAnnotations(stack, annotations) : stack;
	}
	return error;
};
const causePrettyMessage = (u) => {
	if (typeof u.message === "string") return u.message;
	else if (typeof u.toString === "function" && u.toString !== Object.prototype.toString && u.toString !== Array.prototype.toString) try {
		return u.toString();
	} catch {}
	return formatJson(u);
};
const locationRegExp = /\((.*)\)/g;
const cleanErrorStack = (stack, error, annotations) => {
	const message = `${error.name}: ${error.message}`;
	const lines = (stack.startsWith(message) ? stack.slice(message.length) : stack).split("\n");
	const out = [message];
	for (let i = 1; i < lines.length; i++) {
		if (/Generator\.next|~effect\/(?:Effect|Utils)/.test(lines[i])) break;
		out.push(lines[i]);
	}
	return annotations ? addStackAnnotations(out.join("\n"), annotations) : out.join("\n");
};
const addStackAnnotations = (stack, annotations) => {
	const frame = annotations?.get(StackTraceKey.key);
	if (frame) stack = `${stack}\n${currentStackTrace(frame)}`;
	return stack;
};
const interruptCauseStack = (error, interrupts) => {
	const out = [`${error.name}: ${error.message}`];
	for (const current of interrupts) {
		const fiberId = current.fiberId !== void 0 ? `#${current.fiberId}` : "unknown";
		const frame = current.annotations.get(InterruptorStackTrace.key);
		out.push(`    at fiber (${fiberId})`);
		if (frame) out.push(currentStackTrace(frame));
	}
	return out.join("\n");
};
const currentStackTrace = (frame) => {
	const out = [];
	let current = frame;
	let i = 0;
	while (current && i < 10) {
		const stack = current.stack();
		if (stack) {
			const locationMatchAll = stack.matchAll(locationRegExp);
			let match = false;
			for (const [, location] of locationMatchAll) {
				match = true;
				out.push(`    at ${current.name} (${location})`);
			}
			if (!match) out.push(`    at ${current.name} (${stack.replace(/^at /, "")})`);
		} else out.push(`    at ${current.name}`);
		current = current.parent;
		i++;
	}
	return out.join("\n");
};
/** @internal */
const causePretty = (cause) => causePrettyErrors(cause).map(renderPrettyError).join("\n");
const renderPrettyError = (e) => e.cause ? `${e.stack} {\n${renderErrorCause(e.cause, "  ")}\n}` : e.stack;
const renderErrorCause = (cause, prefix) => {
	const lines = cause.stack.split("\n");
	let stack = `${prefix}[cause]: ${lines[0]}`;
	for (let i = 1, len = lines.length; i < len; i++) stack += `\n${prefix}${lines[i]}`;
	if (cause.cause) stack += ` {\n${renderErrorCause(cause.cause, `${prefix}  `)}\n${prefix}}`;
	return stack;
};
/** @internal */
const FiberTypeId = "~effect/Fiber";
const fiberVariance = {
	_A: identity,
	_E: identity
};
const fiberIdStore = { id: 0 };
const AsyncResource = /*#__PURE__*/ (() => {
	try {
		return globalThis.process?.getBuiltinModule?.("node:async_hooks")?.AsyncResource;
	} catch {
		return;
	}
})();
const captureAsyncContext = () => AsyncResource === void 0 ? void 0 : new AsyncResource("effect/Fiber");
/** @internal */
const getCurrentFiber = () => globalThis[currentFiberTypeId];
/** @internal */
var FiberImpl = class {
	constructor(context, interruptible = true) {
		this.setContext(context);
		this.id = ++fiberIdStore.id;
		this.currentOpCount = 0;
		this.interruptible = interruptible;
		this._stack = [];
		this._observers = void 0;
		this._exit = void 0;
		this._children = void 0;
		this._interruptedCause = void 0;
		this._yielded = void 0;
		this._running = false;
		this._deferredInterrupt = false;
		this._parent = void 0;
		this._asyncContext = void 0;
		this.cache.runtimeMetrics?.recordFiberStart(this.context);
	}
	get [FiberTypeId]() {
		return fiberVariance;
	}
	get currentDispatcher() {
		return this._dispatcher ??= this.cache.scheduler.makeDispatcher();
	}
	getRef(ref) {
		return get(this.context, ref);
	}
	addObserver(cb) {
		if (this._exit) {
			cb(this._exit);
			return constVoid;
		}
		if (this._observers === void 0) this._observers = [cb];
		else this._observers.push(cb);
		return () => this.removeObserver(cb);
	}
	removeObserver(cb) {
		if (this._exit || this._observers === void 0) return;
		const index = this._observers.indexOf(cb);
		if (index >= 0) this._observers.splice(index, 1);
	}
	interruptUnsafe(fiberId, annotations) {
		if (this._exit) return;
		let cause = causeInterrupt(fiberId);
		if (this.cache.stackFrame) cause = causeAnnotate(cause, make$2(StackTraceKey, this.cache.stackFrame));
		if (annotations) cause = causeAnnotate(cause, annotations);
		this._interruptedCause = this._interruptedCause ? causeAddInterrupts(this._interruptedCause, cause) : cause;
		if (this.interruptible) {
			if (this._running) this._deferredInterrupt = true;
			else this.evaluate(failCause(this._interruptedCause));
		}
	}
	pollUnsafe() {
		return this._exit;
	}
	evaluate(effect) {
		if (this._exit) return;
		else if (this._asyncContext !== void 0) {
			const asyncContext = this._asyncContext;
			this._asyncContext = void 0;
			try {
				return asyncContext.runInAsyncScope(this.evaluate, this, effect);
			} finally {
				asyncContext.emitDestroy();
			}
		} else if (this._yielded !== void 0) {
			const yielded = this._yielded;
			this._yielded = void 0;
			yielded();
		}
		const exit = this.runLoop(effect);
		if (exit === Yield) {
			this._asyncContext = captureAsyncContext();
			return;
		}
		const interruptChildren = fiberMiddleware.interruptChildren && fiberMiddleware.interruptChildren(this);
		if (interruptChildren !== void 0) return this.evaluate(flatMap$1(interruptChildren, () => exit));
		this._exit = exit;
		this.cache.runtimeMetrics?.recordFiberEnd(this.context, this._exit);
		if (this._parent) {
			this._parent._children?.delete(this);
			this._parent = void 0;
		}
		if (this._observers !== void 0) {
			const observers = this._observers;
			this._observers = void 0;
			for (let i = 0; i < observers.length; i++) observers[i](exit);
		}
		this._stack.length = 0;
		this._children = void 0;
		this.context = empty$1();
		const cache = this.cache;
		if (cache.span !== void 0 || cache.stackFrame !== void 0) this.cache = {
			...cache,
			span: void 0,
			stackFrame: void 0
		};
	}
	runLoop(effect) {
		const prevFiber = globalThis[currentFiberTypeId];
		globalThis[currentFiberTypeId] = this;
		const prevRunning = this._running;
		this._running = true;
		let yielding = false;
		let current = effect;
		this.currentOpCount = 0;
		try {
			while (true) try {
				if (this._deferredInterrupt) {
					this._deferredInterrupt = false;
					current = failCause(this._interruptedCause);
				}
				this.currentOpCount++;
				const cache = this.cache;
				if (!yielding && !cache.preventYield && cache.scheduler.shouldYield(this)) {
					yielding = true;
					const prev = current;
					current = flatMap$1(yieldNow, () => prev);
				}
				current = cache.tracerContext ? cache.tracerContext(current, this) : current[evaluate](this);
				if (current === Yield) {
					const yielded = this._yielded;
					if ("~effect/Exit" in yielded) {
						this._deferredInterrupt = false;
						this._yielded = void 0;
						return yielded;
					} else if (this._deferredInterrupt) {
						this._yielded = void 0;
						yielded();
						continue;
					}
					return Yield;
				}
			} catch (error) {
				if (!hasProperty(current, "~effect/Effect/evaluate")) return exitDie(`Fiber.runLoop: Not a valid effect: ${String(current)}`);
				current = exitDie(error);
			}
		} finally {
			this._running = prevRunning;
			globalThis[currentFiberTypeId] = prevFiber;
		}
	}
	getCont(symbol) {
		if (this._deferredInterrupt) {
			this._deferredInterrupt = false;
			return deferredInterruptCont;
		}
		while (true) {
			const op = this._stack.pop();
			if (!op) return void 0;
			const all = op[contAll];
			if (all !== void 0) {
				const cont = all.call(op, this);
				if (cont) {
					cont[symbol] = cont;
					return cont;
				}
			}
			if (op[symbol]) return op;
		}
	}
	succeedWith(value) {
		if ((++this.currentOpCount & maxInlineSteps - 1) === 0) return exitSucceed(value);
		const cont = this.getCont(contA);
		return cont ? cont[contA](value, this) : this.yieldWith(exitSucceed(value));
	}
	yieldWith(value) {
		this._yielded = value;
		return Yield;
	}
	children() {
		return this._children ??= /* @__PURE__ */ new Set();
	}
	pipe() {
		return pipeArguments(this, arguments);
	}
	setContext(context) {
		const previous = this.context;
		this.context = context;
		if (previous !== void 0 && hasSameCache(previous, context)) return;
		const root = context.cacheRoot;
		const cache = root._fiberCache ??= makeFiberContextCache(context);
		if (this.cache?.scheduler !== cache.scheduler) this._dispatcher = void 0;
		this.cache = cache;
	}
	get currentSpanLocal() {
		const span = this.cache.span;
		return span?._tag === "Span" ? span : void 0;
	}
};
const makeFiberContextCache = (context) => {
	const currentTracer = getOrUndefinedUnsafe(context, TracerKey);
	return {
		scheduler: get(context, Scheduler),
		tracer: currentTracer,
		tracerContext: currentTracer ? currentTracer["context"] : void 0,
		tracerEnabled: get(context, TracerEnabled),
		span: getOrUndefinedUnsafe(context, ParentSpanKey),
		logLevel: get(context, CurrentLogLevel),
		minimumLogLevel: get(context, MinimumLogLevel),
		stackFrame: get(context, CurrentStackFrame),
		runtimeMetrics: getOrUndefinedUnsafe(context, FiberRuntimeMetricsKey),
		maxOpsBeforeYield: get(context, MaxOpsBeforeYield),
		preventYield: get(context, PreventSchedulerYield)
	};
};
const deferredInterruptCont = {
	[contA](_value, fiber) {
		return failCause(fiber._interruptedCause);
	},
	[contE](_cause, fiber) {
		return failCause(fiber._interruptedCause);
	}
};
const maxInlineSteps = 32;
const fiberMiddleware = { interruptChildren: void 0 };
const fiberStackAnnotations = (fiber) => {
	if (!fiber.cache.stackFrame) return void 0;
	const annotations = /* @__PURE__ */ new Map();
	annotations.set(InterruptorStackTrace.key, fiber.cache.stackFrame);
	return makeUnsafe$2(annotations);
};
/** @internal */
const fiberAwaitAll = (self) => callback((resume) => {
	const iter = self[Symbol.iterator]();
	const exits = [];
	let cancel = void 0;
	function loop() {
		let result = iter.next();
		while (!result.done) {
			if (result.value._exit) {
				exits.push(result.value._exit);
				result = iter.next();
				continue;
			}
			cancel = result.value.addObserver((exit) => {
				exits.push(exit);
				loop();
			});
			return;
		}
		resume(succeed$2(exits));
	}
	loop();
	return sync$1(() => cancel?.());
});
/** @internal */
const fiberInterruptAll = (fibers) => withFiber((parent) => {
	const annotations = fiberStackAnnotations(parent);
	let fiberArr = empty();
	for (const fiber of fibers) {
		fiber.interruptUnsafe(parent.id, annotations);
		fiberArr.push(fiber);
	}
	return asVoid$1(fiberAwaitAll(fiberArr));
});
/** @internal */
const succeed$2 = exitSucceed;
/** @internal */
const failCause = exitFailCause;
/** @internal */
const fail$1 = exitFail;
/** @internal */
const sync$1 = /*#__PURE__*/ makePrimitive({
	op: "Sync",
	[evaluate](fiber) {
		const thunk = this[args];
		const value = thunk();
		const cont = fiber.getCont(contA);
		return cont ? cont[contA](value, fiber) : fiber.yieldWith(exitSucceed(value));
	}
});
/** @internal */
const suspend = /*#__PURE__*/ makePrimitive({
	op: "Suspend",
	[evaluate](_fiber) {
		const thunk = this[args];
		return thunk();
	}
});
/** @internal */
const fromOption$1 = /*#__PURE__*/ dual((args) => args.length >= 2 || isOption(args[0]), (option, onNone) => isNone(option) ? onNone ? failSync(onNone) : fail$1(new NoSuchElementError("Effect.fromOption: Option.none")) : succeed$2(option.value));
/** @internal */
const fromResult$1 = /*#__PURE__*/ match$4({
	onFailure: fail$1,
	onSuccess: succeed$2
});
/** @internal */
const yieldNowWith = /*#__PURE__*/ makePrimitive({
	op: "Yield",
	[evaluate](fiber) {
		let resumed = false;
		fiber.currentDispatcher.scheduleTask(() => {
			if (resumed) return;
			fiber.evaluate(exitVoid);
		}, this["~effect/Effect/args"] ?? 0);
		return fiber.yieldWith(() => {
			resumed = true;
		});
	}
});
/** @internal */
const yieldNow = /*#__PURE__*/ yieldNowWith(0);
/** @internal */
const die = (defect) => exitDie(defect);
/** @internal */
const failSync = (error) => suspend(() => fail$1(error()));
/** @internal */
const void_ = /*#__PURE__*/ succeed$2(void 0);
/** @internal */
const tryPromise$1 = (options) => {
	const f = typeof options === "function" ? options : options.try;
	const catcher = typeof options === "function" ? (cause) => new UnknownError(cause, "An error occurred in Effect.tryPromise") : options.catch;
	return callbackOptions(function(resume, signal) {
		const failWithCatch = (cause) => suspend(() => {
			try {
				return fail$1(internalCall(() => catcher(cause)));
			} catch (err) {
				return die(err);
			}
		});
		try {
			f(signal).then((a) => resume(succeed$2(a)), (e) => resume(failWithCatch(e)));
		} catch (err) {
			resume(failWithCatch(err));
		}
	}, f.length !== 0);
};
const callbackOptions = /*#__PURE__*/ function() {
	const Proto = /*#__PURE__*/ makePrimitiveProto({
		op: "Async",
		[evaluate](fiber) {
			let resumed = false;
			let yielded = false;
			const controller = this.withSignal ? new AbortController() : void 0;
			const onCancel = this.register.call(fiber.cache.scheduler, (effect) => {
				if (resumed) return;
				resumed = true;
				if (yielded) fiber.evaluate(effect);
				else yielded = effect;
			}, controller?.signal);
			if (yielded !== false) return yielded;
			yielded = true;
			fiber.yieldWith(() => {
				resumed = true;
			});
			if (controller === void 0 && onCancel === void 0) return Yield;
			fiber._stack.push(asyncFinalizer(() => {
				resumed = true;
				controller?.abort();
				return onCancel ?? exitVoid;
			}));
			return Yield;
		}
	});
	const AsyncImpl = function(register, withSignal) {
		this.register = register;
		this.withSignal = withSignal;
	};
	AsyncImpl.prototype = Proto;
	return function(register, withSignal) {
		return new AsyncImpl(register, withSignal);
	};
}();
const asyncFinalizer = /*#__PURE__*/ makePrimitive({
	op: "AsyncFinalizer",
	[contAll](fiber) {
		if (fiber.interruptible) {
			fiber.interruptible = false;
			fiber._stack.push(setInterruptibleTrue);
		}
	},
	[contE](cause, _fiber) {
		return hasInterrupts(cause) ? flatMap$1(combineFinalizerCause(exitFailCause(cause), this[args]()), () => failCause(cause)) : failCause(cause);
	}
});
/** @internal */
const callback = (register) => callbackOptions(register, register.length >= 2);
/** @internal */
const never = /*#__PURE__*/ callback(constVoid);
/** @internal */
const gen$1 = (...args) => {
	if (args.length === 1) {
		const body = args[0];
		return suspend(() => fromIteratorUnsafe(body()));
	}
	const [options, body] = args;
	return suspend(() => fromIteratorUnsafe(body.call(options.self)));
};
const fnBody = (bodyOrOptions, pipeables) => typeof bodyOrOptions === "function" ? bodyOrOptions : pipeables.shift().bind(bodyOrOptions.self);
/** @internal */
const fnUntraced$1 = (bodyOrOptions, ...pipeables) => {
	const body = fnBody(bodyOrOptions, pipeables);
	const fn = pipeables.length === 0 ? function() {
		return suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
	} : function() {
		let effect = suspend(() => fromIteratorUnsafe(body.apply(this, arguments)));
		for (let i = 0; i < pipeables.length; i++) effect = pipeables[i](effect, ...arguments);
		return effect;
	};
	return defineFunctionLength(body.length, fn);
};
const defineFunctionLength = (length, fn) => Object.defineProperty(fn, "length", {
	value: length,
	configurable: true
});
const fnStackCleaner = /*#__PURE__*/ makeStackCleaner(2);
/** @internal */
const fn$1 = function() {
	const nameFirst = typeof arguments[0] === "string";
	const name = nameFirst ? arguments[0] : "Effect.fn";
	const spanOptions = nameFirst ? arguments[1] : void 0;
	const prevLimit = getStackTraceLimit();
	let defError;
	if (prevLimit !== 0) {
		setStackTraceLimit(2);
		defError = new globalThis.Error();
		setStackTraceLimit(prevLimit);
	}
	if (nameFirst) return (body, ...pipeables) => makeFn(name, body, defError, pipeables, nameFirst, spanOptions);
	return makeFn(name, arguments[0], defError, Array.prototype.slice.call(arguments, 1), nameFirst, spanOptions);
};
const makeFn = (name, bodyOrOptions, defError, pipeables, addSpan, spanOptions) => {
	const body = fnBody(bodyOrOptions, pipeables);
	const definitionName = `${name} (definition)`;
	const definitionStack = defError ? fnStackCleaner(() => defError.stack) : constUndefined;
	const makeCallFrame = (callError) => (prev) => ({
		name,
		stack: callError ? fnStackCleaner(() => callError.stack) : constUndefined,
		parent: {
			name: definitionName,
			stack: definitionStack,
			parent: prev
		}
	});
	return defineFunctionLength(body.length, function(...args) {
		let result = suspend(() => {
			const iter = body.apply(this, arguments);
			return isEffect(iter) ? iter : fromIteratorUnsafe(iter);
		});
		for (let i = 0; i < pipeables.length; i++) result = pipeables[i](result, ...args);
		if (!isEffect(result)) return result;
		const prevLimit = getStackTraceLimit();
		let callError;
		if (prevLimit !== 0) {
			setStackTraceLimit(2);
			callError = new globalThis.Error();
			setStackTraceLimit(prevLimit);
		}
		return updateService(addSpan ? useSpan(name, spanOptions, (span) => provideParentSpan(result, span)) : result, CurrentStackFrame, makeCallFrame(callError));
	});
};
const fromIteratorUnsafe = /*#__PURE__*/ function() {
	const Proto = /*#__PURE__*/ makePrimitiveProto({
		op: "Iterator",
		[contA](value, fiber) {
			const iter = this.iterator;
			while (true) {
				const state = iter.next(value);
				if (state.done) return succeed$2(state.value);
				if (!effectIsExit(state.value)) {
					fiber._stack.push(this);
					return state.value;
				} else if (state.value._tag === "Failure") return state.value;
				value = state.value.value;
			}
		},
		[evaluate](fiber) {
			return this[contA](this.initial, fiber);
		}
	});
	const IteratorImpl = function(iterator, initial) {
		this.iterator = iterator;
		this.initial = initial;
	};
	IteratorImpl.prototype = Proto;
	return function(iterator, initial) {
		return new IteratorImpl(iterator, initial);
	};
}();
/** @internal */
const as$1 = /*#__PURE__*/ dual(2, (self, value) => new ContImpl(self, returnPayload, succeed$2(value)));
const evaluateCont = function(fiber) {
	fiber._stack.push(this);
	return this[args];
};
const OnSuccessProto = /*#__PURE__*/ makePrimitiveProto({
	op: "OnSuccess",
	[evaluate]: evaluateCont
});
const ContImpl = function(self, cont, payload) {
	this[args] = self;
	this[contA] = cont;
	this.payload = payload;
};
ContImpl.prototype = OnSuccessProto;
const returnPayload = function() {
	return this.payload;
};
const succeedPayload = function(_value, fiber) {
	return fiber.succeedWith(this.payload);
};
const continuationMarksStack = /*#__PURE__*/ (() => {
	const limit = /*#__PURE__*/ getStackTraceLimit();
	if (limit === 0) return false;
	const marker = "~effect/Effect/stackProbe";
	const probe = { [marker]: function stackProbe() {
		return /* @__PURE__ */ new Error();
	} };
	setStackTraceLimit(1);
	const error = /*#__PURE__*/ probe[marker]();
	setStackTraceLimit(limit);
	return error.stack?.includes("[as " + marker + "]") === true;
})();
const mapCont = function(value, fiber) {
	const f = this.payload;
	return fiber.succeedWith(continuationMarksStack ? f(value) : internalCall(() => f(value)));
};
const andThenCont = function(value) {
	const f = this.payload;
	return f(value);
};
const tapCont = function(value) {
	const f = this.payload;
	return new ContImpl(f(value), succeedPayload, value);
};
const tapEffectCont = function(value) {
	return new ContImpl(this.payload, succeedPayload, value);
};
/** @internal */
const asSome$1 = (self) => map$1(self, some);
/** @internal */
const andThen$1 = /*#__PURE__*/ dual(2, (self, f) => new ContImpl(self, isEffect(f) ? returnPayload : andThenCont, f));
/** @internal */
const tap$1 = /*#__PURE__*/ dual(2, (self, f) => new ContImpl(self, isEffect(f) ? tapEffectCont : tapCont, f));
/** @internal */
const asVoid$1 = (self) => new ContImpl(self, returnPayload, exitVoid);
/** @internal */
const flatMap$1 = /*#__PURE__*/ dual(2, (self, f) => new ContImpl(self, andThenCont, f));
/** @internal */
const effectIsExit = (effect) => effect[ExitTypeId] !== void 0;
/** @internal */
const map$1 = /*#__PURE__*/ dual(2, (self, f) => new ContImpl(self, mapCont, f));
/** @internal */
const exitIsSuccess = (self) => self._tag === "Success";
/** @internal */
const exitVoid = /*#__PURE__*/ exitSucceed(void 0);
/** @internal */
const exitMatch = /*#__PURE__*/ dual(2, (self, options) => exitIsSuccess(self) ? options.onSuccess(self.value) : options.onFailure(self.cause));
/** @internal */
const exitAsVoidAll = (exits) => {
	const failures = [];
	for (const exit of exits) if (exit._tag === "Failure") failures.push(...exit.cause.reasons);
	return failures.length === 0 ? exitVoid : exitFailCause(causeFromReasons(failures));
};
/** @internal */
const updateContext = /*#__PURE__*/ dual(2, (self, f) => withFiber((fiber) => {
	const prevContext = fiber.context;
	const nextContext = f(prevContext);
	if (prevContext === nextContext) return self;
	fiber.setContext(nextContext);
	onExitUnsafe(fiber, () => {
		fiber.setContext(prevContext);
	});
	return self;
}));
/** @internal */
const updateService = /*#__PURE__*/ dual(3, (self, service, f) => updateContext(self, (s) => {
	const prev = getUnsafe(s, service);
	const next = f(prev);
	if (prev === next) return s;
	return add(s, service, next);
}));
/** @internal */
const provideContext = /*#__PURE__*/ dual(2, (self, context) => {
	if (effectIsExit(self)) return self;
	return updateContext(self, merge(context));
});
/** @internal */
const provideService = function() {
	if (arguments.length === 1) return dual(2, (self, impl) => provideServiceImpl(self, arguments[0], impl));
	return dual(3, (self, service, impl) => provideServiceImpl(self, service, impl)).apply(this, arguments);
};
const provideServiceImpl = (self, service, implementation) => updateContext(self, add(service, implementation));
/** @internal */
const filterOrFail$1 = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, predicate, orFailWith) => filterOrElse(self, predicate, orFailWith ? (a) => fail$1(orFailWith(a)) : () => fail$1(new NoSuchElementError())));
/** @internal */
const catchCause = /*#__PURE__*/ dual(2, (self, f) => new OnFailureImpl(self, f.length !== 1 ? (cause) => f(cause) : f));
const OnFailureProto = /*#__PURE__*/ makePrimitiveProto({
	op: "OnFailure",
	[evaluate]: evaluateCont
});
const OnFailureImpl = function(self, f) {
	this[args] = self;
	this[contE] = f;
};
OnFailureImpl.prototype = OnFailureProto;
/** @internal */
const catchCauseFilter = /*#__PURE__*/ dual(3, (self, filter, f) => catchCause(self, (cause) => {
	const eb = filter(cause);
	return isFailure(eb) ? failCause(eb.failure) : f(eb.success, cause);
}));
/** @internal */
const catch_$1 = /*#__PURE__*/ dual(2, (self, f) => catchCauseFilter(self, findRecoverableError, (e) => f(e)));
/** @internal */
const catchDefect$1 = /*#__PURE__*/ dual(2, (self, f) => catchCauseFilter(self, findDefect, f));
/** @internal */
const catchIf$1 = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, predicate, f, orElse) => catchCause(self, (cause) => {
	const error = findRecoverableError(cause);
	if (isFailure(error)) return failCause(error.failure);
	if (!predicate(error.success)) return orElse ? orElse(error.success) : failCause(cause);
	return f(error.success);
}));
/** @internal */
const catchFilter = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, filter, f, orElse) => catchCause(self, (cause) => {
	const error = findRecoverableError(cause);
	if (isFailure(error)) return failCause(error.failure);
	const result = filter(error.success);
	if (isFailure(result)) return orElse ? orElse(result.failure) : failCause(cause);
	return f(result.success);
}));
/** @internal */
const catchTag$1 = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, k, f, orElse) => {
	const pred = Array.isArray(k) ? (e) => hasProperty(e, "_tag") && k.includes(e._tag) : isTagged(k);
	return catchIf$1(self, pred, f, orElse);
});
/** @internal */
const catchTags$1 = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, cases, orElse) => {
	let keys;
	return catchFilter(self, (e) => {
		keys ??= Object.keys(cases);
		return hasProperty(e, "_tag") && isString(e["_tag"]) && keys.includes(e["_tag"]) ? succeed$3(e) : fail$2(e);
	}, (e) => cases[e["_tag"]](e), orElse);
});
/** @internal */
const mapError$1 = /*#__PURE__*/ dual(2, (self, f) => catchCause(self, (cause) => failCause(causeMap(cause, f))));
/** @internal */
const option$1 = (self) => match$2(self, {
	onFailure: none,
	onSuccess: some
});
/** @internal */
const result$1 = (self) => matchEager(self, {
	onFailure: fail$2,
	onSuccess: succeed$3
});
/** @internal */
const matchCauseEffect = /*#__PURE__*/ dual(2, (self, options) => new OnSuccessAndFailureImpl(self, options.onSuccess.length !== 1 ? (a) => options.onSuccess(a) : options.onSuccess, options.onFailure.length !== 1 ? (cause) => options.onFailure(cause) : options.onFailure));
const OnSuccessAndFailureProto = /*#__PURE__*/ makePrimitiveProto({
	op: "OnSuccessAndFailure",
	[evaluate]: evaluateCont
});
const OnSuccessAndFailureImpl = function(self, onSuccess, onFailure) {
	this[args] = self;
	this[contA] = onSuccess;
	this[contE] = onFailure;
};
OnSuccessAndFailureImpl.prototype = OnSuccessAndFailureProto;
const matchSuccess = function(value, fiber) {
	const handlers = this.payload;
	return fiber.succeedWith(continuationMarksStack ? handlers.onSuccess(value) : internalCall(() => handlers.onSuccess(value)));
};
const makeMatch = (op, onFailure) => {
	const Proto = makePrimitiveProto({
		op,
		[evaluate]: evaluateCont,
		[contA]: matchSuccess,
		[contE]: onFailure
	});
	const MatchImpl = function(self, handlers) {
		this[args] = self;
		this.payload = handlers;
	};
	MatchImpl.prototype = Proto;
	return MatchImpl;
};
const MatchImpl = /*#__PURE__*/ makeMatch("Match", function(cause, fiber) {
	const error = findRecoverableError(cause);
	if (isFailure(error)) return failCause(error.failure);
	const handlers = this.payload;
	return fiber.succeedWith(continuationMarksStack ? handlers.onFailure(error.success) : internalCall(() => handlers.onFailure(error.success)));
});
/** @internal */
const matchEffect$1 = /*#__PURE__*/ dual(2, (self, options) => matchCauseEffect(self, {
	onFailure: (cause) => {
		const error = findRecoverableError(cause);
		return isFailure(error) ? failCause(error.failure) : options.onFailure(error.success);
	},
	onSuccess: options.onSuccess
}));
/** @internal */
const match$2 = /*#__PURE__*/ dual(2, (self, options) => new MatchImpl(self, options));
/** @internal */
const matchEager = /*#__PURE__*/ dual(2, (self, options) => {
	if (effectIsExit(self)) {
		if (self._tag === "Success") return exitSucceed(options.onSuccess(self.value));
		const error = findRecoverableError(self.cause);
		if (isFailure(error)) return exitFailCause(error.failure);
		return exitSucceed(options.onFailure(error.success));
	}
	return match$2(self, options);
});
/** @internal */
const exit = (self) => effectIsExit(self) ? exitSucceed(self) : exitPrimitive(self);
const exitPrimitive = /*#__PURE__*/ makePrimitive({
	op: "Exit",
	[evaluate](fiber) {
		fiber._stack.push(this);
		return this[args];
	},
	[contA](value, fiber, exit) {
		return fiber.succeedWith(exit ?? exitSucceed(value));
	},
	[contE](cause, fiber, exit) {
		return fiber.succeedWith(exit ?? exitFailCause(cause));
	}
});
/** @internal */
const ScopeTypeId = "~effect/Scope";
/** @internal */
const ScopeCloseableTypeId = "~effect/Scope/Closeable";
/** @internal */
const scopeClose = (self, exit_) => withFiber((fiber) => {
	fiberEnterUninterruptibleUnsafe(fiber);
	return scopeCloseUnsafe(self, exit_) ?? void_;
});
/** @internal */
const scopeCloseUnsafe = (self, exit_) => {
	const state = self.state;
	if (state._tag === "Closed") return;
	self.state = {
		_tag: "Closed",
		exit: exit_
	};
	if (self.parent !== void 0) scopeRemoveFinalizerUnsafe(self.parent, self);
	if (state._tag === "Empty") return;
	if (state.finalizer !== void 0) return runFinalizer(state.finalizer, exit_);
	const finalizers = state.finalizers;
	if (finalizers.size === 1) return runFinalizer(finalizers.values().next().value, exit_);
	return scopeCloseFinalizers(self, finalizers, exit_);
};
const runFinalizer = (finalizer, exit_) => {
	try {
		return finalizer(exit_);
	} catch (defect) {
		return exitDie(defect);
	}
};
const combineFinalizerCause = (exit_, finalizer) => exitIsSuccess(exit_) ? finalizer : catchCause(finalizer, (cause) => failCause(causeElectDefects(causeCombine(exit_.cause, cause))));
const scopeCloseFinalizers = /*#__PURE__*/ fnUntraced$1(function* (self, finalizers, exit_) {
	let exits = [];
	const fibers = [];
	const arr = Array.from(finalizers);
	const parent = getCurrentFiber();
	for (let i = arr.length - 1; i >= 0; i--) {
		const [key, finalizer] = arr[i];
		if (self.strategy === "sequential") exits.push(yield* exit(runFinalizer(finalizer, exit_)));
		else if (key !== parent) fibers.push(forkUnsafe$1(parent, runFinalizer(finalizer, exit_), true, true, "inherit"));
	}
	if (fibers.length > 0) exits = yield* fiberAwaitAll(fibers);
	return yield* exitAsVoidAll(exits);
});
/** @internal */
const scopeForkUnsafe = (scope, finalizerStrategy) => {
	const child = makeScope(finalizerStrategy, scope);
	if (scope.state._tag === "Closed") {
		child.state = scope.state;
		return child;
	}
	scopeAddFinalizerUnsafe(scope, child, (exit) => scopeClose(child, exit));
	return child;
};
/** @internal */
const scopeAddFinalizerUnsafe = (scope, key, finalizer) => {
	if (scope.state._tag === "Empty") scope.state = {
		_tag: "Open",
		finalizerKey: key,
		finalizer,
		finalizers: void 0
	};
	else if (scope.state._tag === "Open") {
		const state = scope.state;
		if (state.finalizer !== void 0) {
			state.finalizers = /* @__PURE__ */ new Map([[state.finalizerKey, state.finalizer]]);
			state.finalizerKey = void 0;
			state.finalizer = void 0;
			state.finalizers.set(key, finalizer);
		} else state.finalizers.set(key, finalizer);
	}
};
/** @internal */
const scopeRemoveFinalizerUnsafe = (scope, key) => {
	if (scope.state._tag !== "Open") return;
	const state = scope.state;
	if (state.finalizerKey === key) scope.state = constScopeEmpty;
	else if (state.finalizers !== void 0) {
		state.finalizers.delete(key);
		if (state.finalizers.size === 0) scope.state = constScopeEmpty;
	}
};
/** @internal */
const scopeMakeUnsafe = (finalizerStrategy) => makeScope(finalizerStrategy, void 0);
const makeScope = (finalizerStrategy = "sequential", parent) => ({
	[ScopeCloseableTypeId]: ScopeCloseableTypeId,
	[ScopeTypeId]: ScopeTypeId,
	strategy: finalizerStrategy,
	parent,
	state: constScopeEmpty
});
const constScopeEmpty = { _tag: "Empty" };
/** @internal */
const scopedWith = (f) => suspend(() => {
	const scope = scopeMakeUnsafe();
	return onExit(f(scope), (exit) => suspend(() => scopeCloseUnsafe(scope, exit) ?? void_));
});
const OnExitImpl = /*#__PURE__*/ function() {
	const Proto = /*#__PURE__*/ makePrimitiveProto({
		op: "OnExit",
		[evaluate](fiber) {
			fiber._stack.push(this);
			return this.effect;
		},
		[contAll](fiber) {
			if (fiber.interruptible && this.interruptible !== true) {
				fiber._stack.push(setInterruptibleTrue);
				fiber.interruptible = false;
			}
		},
		[contA](value, _, exit) {
			exit ??= exitSucceed(value);
			let eff;
			try {
				eff = this.onExit(exit);
			} catch (defect) {
				eff = exitDie(defect);
			}
			return eff ? flatMap$1(eff, (_) => exit) : exit;
		},
		[contE](cause, _, exit) {
			exit ??= exitFailCause(cause);
			let eff;
			try {
				eff = this.onExit(exit);
			} catch (defect) {
				eff = exitDie(defect);
			}
			return eff ? flatMap$1(combineFinalizerCause(exit, eff), (_) => exit) : exit;
		}
	});
	const OnExitImpl = function(effect, onExit, interruptible) {
		this.effect = effect;
		this.onExit = onExit;
		this.interruptible = interruptible;
	};
	OnExitImpl.prototype = Proto;
	return OnExitImpl;
}();
/** @internal */
const onExitPrimitive = (effect, onExit, interruptible) => new OnExitImpl(effect, onExit, interruptible);
/**
* Pushes an exit finalizer for the current `withFiber` evaluation. Only call inside `withFiber`.
* @internal
*/
const onExitUnsafe = (fiber, f) => {
	fiber._stack.push(new OnExitImpl(void 0, f, void 0));
};
/** @internal */
const onExit = /*#__PURE__*/ dual(2, onExitPrimitive);
/** @internal */
const ensuring$1 = /*#__PURE__*/ dual(2, (self, finalizer) => onExit(self, (_) => finalizer));
/** @internal */
const uninterruptible = (self) => withFiber((fiber) => {
	if (!fiber.interruptible) return self;
	fiber.interruptible = false;
	fiber._stack.push(setInterruptibleTrue);
	return self;
});
const setInterruptible = /*#__PURE__*/ makePrimitive({
	op: "SetInterruptible",
	[contAll](fiber) {
		fiber.interruptible = this[args];
		if (fiber._interruptedCause && fiber.interruptible) return () => failCause(fiber._interruptedCause);
	}
});
const setInterruptibleTrue = /*#__PURE__*/ setInterruptible(true);
/**
* Makes the current fiber uninterruptible for the returned effect without an
* extra primitive. Call only within `withFiber`.
*
* @internal
*/
const fiberEnterUninterruptibleUnsafe = (fiber) => {
	const impl = fiber;
	if (!impl.interruptible) return;
	impl.interruptible = false;
	impl._stack.push(setInterruptibleTrue);
};
/** @internal */
const all$1 = (arg, options) => {
	if (isIterable(arg)) return options?.mode === "result" ? forEach$1(arg, result$1, options) : forEach$1(arg, identity, options);
	else if (options?.discard) return options.mode === "result" ? forEach$1(Object.values(arg), result$1, options) : forEach$1(Object.values(arg), identity, options);
	return suspend(() => map$1(forEach$1(Object.entries(arg), ([key, effect]) => map$1(options?.mode === "result" ? result$1(effect) : effect, (value) => [key, value]), { concurrency: options?.concurrency }), Object.fromEntries));
};
/** @internal */
const whileLoop = /*#__PURE__*/ makePrimitive({
	op: "While",
	[contA](value, fiber) {
		this[args].step(value);
		if (this["~effect/Effect/args"].while()) {
			fiber._stack.push(this);
			return this[args].body();
		}
		return exitVoid;
	},
	[evaluate](fiber) {
		if (this["~effect/Effect/args"].while()) {
			fiber._stack.push(this);
			return this[args].body();
		}
		return exitVoid;
	}
});
/** @internal */
const forEach$1 = /*#__PURE__*/ dual((args) => typeof args[1] === "function", (iterable, f, options) => suspend(() => {
	const concurrency = resolveConcurrency(options?.concurrency);
	if (concurrency === 1) return forEachSequential(iterable, f, options);
	const items = fromIterable(iterable);
	let length = items.length;
	if (length === 0) return options?.discard ? void_ : succeed$2([]);
	const out = options?.discard ? void 0 : new Array(length);
	const eff = forEachConcurrent({
		f,
		out
	}, items, { concurrency });
	return eff ? as$1(eff, out) : succeed$2(out);
}));
const forEachSequential = (iterable, f, options) => suspend(() => {
	const out = options?.discard ? void 0 : [];
	const iterator = iterable[Symbol.iterator]();
	let state = iterator.next();
	let index = 0;
	return as$1(whileLoop({
		while: () => !state.done,
		body: () => f(state.value, index++),
		step: (b) => {
			if (out) out.push(b);
			state = iterator.next();
		}
	}), out);
});
/** @internal */
const resolveConcurrency = (concurrency) => concurrency === "unbounded" ? Number.POSITIVE_INFINITY : Math.max(1, concurrency ?? 1);
const iterateConcurrentImpl = (options) => {
	const onItem = options.onItem;
	const step = options.step;
	return (state, items, opts) => {
		let index = 0;
		const end = opts.end ?? items.length;
		const concurrency = opts.concurrency;
		let done = false;
		let parentFiber;
		let fibers;
		let resume;
		let terminal;
		let effect;
		const failDefect = (error) => {
			const defect = exitDie(error);
			terminal = defect;
			done = true;
			return fibers && fibers.size > 0 ? flatMap$1(uninterruptible(fiberInterruptAll(Array.from(fibers))), () => terminal ?? defect) : defect;
		};
		const go = () => {
			let paused = false;
			for (; !terminal && index < end; index++) {
				const item = items[index];
				const eff = effect ?? onItem(state, item, index);
				if (effectIsExit(eff)) {
					terminal = step(state, item, eff, index);
					if (terminal) break;
				} else if (!parentFiber) return callback((cb) => {
					parentFiber = getCurrentFiber();
					fibers = /* @__PURE__ */ new Set();
					effect = eff;
					resume = cb;
					let result;
					try {
						result = go();
					} catch (error) {
						return cb(failDefect(error));
					}
					if (result) return cb(result);
					return suspend(() => {
						terminal ??= exitVoid;
						return flatMap$1(fibers ? fiberInterruptAll(fibers) : void_, () => terminal?._tag === "Failure" ? terminal : void_);
					});
				});
				else {
					effect = void 0;
					const fiber = forkUnsafe$1(parentFiber, eff, true, true, "inherit");
					if (fiber._exit) {
						terminal = step(state, item, fiber._exit, index);
						if (terminal) break;
						continue;
					}
					fibers.add(fiber);
					const currentIndex = index;
					fiber.addObserver((exit) => {
						fibers.delete(fiber);
						try {
							if (terminal) {
								if (exit._tag === "Failure") {
									const reasons = exit.cause.reasons.filter((reason) => reason._tag !== "Interrupt");
									if (reasons.length > 0) {
										const cause = causeFromReasons(reasons);
										terminal = exitFailCause(terminal._tag === "Failure" ? causeElectDefects(causeCombine(terminal.cause, cause)) : cause);
									}
								}
							} else {
								const result = step(state, item, exit, currentIndex);
								if (result) {
									terminal = result;
									go();
								}
							}
							if (paused) {
								const eff = go();
								if (eff) resume(eff);
							} else if (done && fibers.size === 0) resume(terminal ?? void_);
						} catch (error) {
							resume(failDefect(error));
						}
					});
					if (fibers.size < concurrency) continue;
					paused = true;
					index++;
					return;
				}
			}
			done = true;
			if (terminal) {
				if (fibers && fibers.size > 0) {
					const annotations = fiberStackAnnotations(parentFiber);
					fibers.forEach((f) => f.interruptUnsafe(parentFiber.id, annotations));
					return;
				}
				if (resume || terminal._tag === "Failure") return terminal;
			} else if (resume) {
				if (!fibers) return exitVoid;
				else if (fibers.size === 0) resume(void_);
			}
		};
		return go();
	};
};
const forEachConcurrent = /*#__PURE__*/ iterateConcurrentImpl({
	onItem(state, item, index) {
		return state.f(item, index);
	},
	step(state, _, exit, index) {
		if (exit._tag === "Failure") return exit;
		else if (state.out) state.out[index] = exit.value;
	}
});
/** @internal */
const filterOrElse = /*#__PURE__*/ dual(3, (self, predicate, orElse) => flatMap$1(self, (a) => predicate(a) ? succeed$2(a) : orElse(a)));
/** @internal */
const forkUnsafe$1 = (parent, effect, immediate = false, daemon = false, uninterruptible = false) => {
	const parentRuntime = parent;
	const interruptible = uninterruptible === "inherit" ? parentRuntime.interruptible : !uninterruptible;
	const child = new FiberImpl(parentRuntime.context, interruptible);
	if (!daemon) {
		parentRuntime.children().add(child);
		child._parent = parentRuntime;
	}
	if (immediate) child.evaluate(effect);
	else {
		child._asyncContext = captureAsyncContext();
		parentRuntime.currentDispatcher.scheduleTask(() => child.evaluate(effect), 0);
	}
	return child;
};
/** @internal */
const runForkWith = (context) => (effect, options) => {
	const fiber = new FiberImpl(options?.scheduler ? add(context, Scheduler, options.scheduler) : context, options?.uninterruptible !== true);
	fiber.evaluate(effect);
	if (fiber._exit) return fiber;
	if (options?.signal) {
		if (options.signal.aborted) fiber.interruptUnsafe();
		else {
			const abort = () => fiber.interruptUnsafe();
			options.signal.addEventListener("abort", abort, { once: true });
			fiber.addObserver(() => options.signal.removeEventListener("abort", abort));
		}
	}
	if (options?.onFiberStart) options.onFiberStart(fiber);
	return fiber;
};
/** @internal */
const runPromiseExitWith = (context) => {
	const runFork = runForkWith(context);
	return (effect, options) => {
		const fiber = runFork(effect, options);
		return new Promise((resolve) => {
			fiber.addObserver((exit) => resolve(exit));
		});
	};
};
/** @internal */
const runPromiseExit$1 = /*#__PURE__*/ runPromiseExitWith(/*#__PURE__*/ empty$1());
const bigint0 = /*#__PURE__*/ BigInt(0);
const NoopSpanProto = {
	_tag: "Span",
	spanId: "noop",
	traceId: "noop",
	sampled: false,
	status: {
		_tag: "Ended",
		startTime: bigint0,
		endTime: bigint0,
		exit: exitVoid
	},
	attributes: /*#__PURE__*/ new Map(),
	links: [],
	kind: "internal",
	attribute() {},
	event() {},
	end() {},
	addLinks() {}
};
/** @internal */
const noopSpan = (options) => Object.assign(Object.create(NoopSpanProto), options);
const filterDisablePropagation = (span) => {
	if (!span) return none();
	return get(span.annotations, DisablePropagation) ? span._tag === "Span" ? filterDisablePropagation(getOrUndefined$1(span.parent)) : none() : some(span);
};
/** @internal */
const makeSpanUnsafe = (fiber, name, options) => {
	const disablePropagation = !fiber.cache.tracerEnabled || options?.annotations && get(options.annotations, DisablePropagation);
	const parent = options?.parent !== void 0 ? some(options.parent) : options?.root ? none() : filterDisablePropagation(fiber.cache.span);
	let span;
	if (disablePropagation) span = noopSpan({
		name,
		parent,
		annotations: add(options?.annotations ?? empty$1(), DisablePropagation, true)
	});
	else {
		const tracer = fiber.cache.tracer ?? nativeTracer;
		const clock = fiber.getRef(ClockRef);
		const timingEnabled = fiber.getRef(TracerTimingEnabled);
		const annotationsFromEnv = fiber.getRef(TracerSpanAnnotations);
		const linksFromEnv = fiber.getRef(TracerSpanLinks);
		const level = options?.level ?? fiber.getRef(CurrentTraceLevel);
		const links = options?.links !== void 0 ? [...linksFromEnv, ...options.links] : linksFromEnv.length === 0 ? [] : linksFromEnv.slice();
		span = tracer.span({
			name,
			parent,
			annotations: options?.annotations ?? empty$1(),
			links,
			startTime: timingEnabled ? clock.currentTimeNanosUnsafe() : bigint0,
			kind: options?.kind ?? "internal",
			root: options?.root ?? false,
			sampled: options?.sampled ?? (isSome(parent) && parent.value.sampled === false ? false : !isLogLevelGreaterThan(fiber.getRef(MinimumTraceLevel), level))
		});
		for (const key in annotationsFromEnv) span.attribute(key, annotationsFromEnv[key]);
		if (options?.attributes !== void 0) for (const key in options.attributes) span.attribute(key, options.attributes[key]);
	}
	return span;
};
/** @internal */
const endSpan = (span, exit, clock, timingEnabled) => sync$1(() => {
	if (span.status._tag === "Ended") return;
	span.end(timingEnabled ? clock.currentTimeNanosUnsafe() : bigint0, exit);
});
/** @internal */
const useSpan = (name, ...args) => {
	const options = args.length === 1 ? void 0 : args[0];
	const evaluate = args[args.length - 1];
	return withFiber((fiber) => {
		const span = makeSpanUnsafe(fiber, name, options);
		const clock = fiber.getRef(ClockRef);
		const timingEnabled = fiber.getRef(TracerTimingEnabled);
		onExitUnsafe(fiber, (exit) => endSpan(span, exit, clock, timingEnabled));
		return evaluate(span);
	});
};
const provideParentSpan = /*#__PURE__*/ provideService(ParentSpan);
/** @internal */
const ClockRef = /*#__PURE__*/ Reference("effect/Clock", { defaultValue: () => new ClockImpl() });
const MAX_TIMER_MILLIS = 2 ** 31 - 1;
var ClockImpl = class {
	currentTimeMillisUnsafe() {
		return Date.now();
	}
	currentTimeMillis = /*#__PURE__*/ sync$1(() => this.currentTimeMillisUnsafe());
	currentTimeNanosUnsafe() {
		return wallTimeNanos();
	}
	currentTimeNanos = /*#__PURE__*/ sync$1(() => this.currentTimeNanosUnsafe());
	monotonicTimeNanosUnsafe() {
		return monotonicNowNanos();
	}
	monotonicTimeNanos = /*#__PURE__*/ sync$1(() => this.monotonicTimeNanosUnsafe());
	sleep(duration) {
		return this.sleepMillis(toMillis(duration));
	}
	sleepMillis(millis) {
		if (millis <= 0) return yieldNow;
		else if (!Number.isFinite(millis)) return never;
		return callback((resume) => {
			const continuation = millis > MAX_TIMER_MILLIS ? this.sleepMillis(millis - MAX_TIMER_MILLIS) : void_;
			const handle = setTimeout(() => resume(continuation), Math.min(millis, MAX_TIMER_MILLIS));
			return sync$1(() => clearTimeout(handle));
		});
	}
};
const nanosPerMilli = /*#__PURE__*/ BigInt(1e6);
const monotonicNowNanos = /*#__PURE__*/ function() {
	const processHrtime = globalThis.process?.hrtime;
	if (typeof processHrtime?.bigint === "function") return () => processHrtime.bigint();
	if (typeof performance !== "undefined" && typeof performance.now === "function") return () => BigInt(Math.round(performance.now() * 1e6));
	let previous = /*#__PURE__*/ BigInt(0);
	return () => {
		const current = BigInt(Date.now()) * nanosPerMilli;
		if (current > previous) previous = current;
		return previous;
	};
}();
const wallTimeNanos = /*#__PURE__*/ function() {
	const reanchorThresholdNanos = /*#__PURE__*/ BigInt(1e9);
	let origin;
	return () => {
		const monotonic = monotonicNowNanos();
		const wall = BigInt(Date.now()) * nanosPerMilli;
		if (origin === void 0) origin = wall - monotonic;
		else {
			const projected = origin + monotonic;
			if ((wall > projected ? wall - projected : projected - wall) > reanchorThresholdNanos) origin = wall - monotonic;
		}
		return origin + monotonic;
	};
}();
/** @internal */
const UnknownErrorTypeId = "~effect/Cause/UnknownError";
/** @internal */
var UnknownError = class extends (/*#__PURE__*/ TaggedError$1("UnknownError")) {
	[UnknownErrorTypeId] = UnknownErrorTypeId;
	constructor(cause, message) {
		super({
			message,
			cause
		});
	}
};
/** @internal */
const logLevelToOrder = (level) => {
	switch (level) {
		case "All": return Number.MIN_SAFE_INTEGER;
		case "Fatal": return 5e4;
		case "Error": return 4e4;
		case "Warn": return 3e4;
		case "Info": return 2e4;
		case "Debug": return 1e4;
		case "Trace": return 0;
		case "None": return Number.MAX_SAFE_INTEGER;
	}
};
/** @internal */
const LogLevelOrder = /*#__PURE__*/ mapInput(Number$1, logLevelToOrder);
/** @internal */
const isLogLevelGreaterThan = /*#__PURE__*/ isGreaterThan(LogLevelOrder);
const colors = {
	bold: "1",
	red: "31",
	green: "32",
	yellow: "33",
	blue: "34",
	cyan: "36",
	white: "37",
	gray: "90",
	black: "30",
	bgBrightRed: "101"
};
const logLevelColors = {
	None: [],
	All: [],
	Trace: [colors.gray],
	Debug: [colors.blue],
	Info: [colors.green],
	Warn: [colors.yellow],
	Error: [colors.red],
	Fatal: [colors.bgBrightRed, colors.black]
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Cause.js
/**
* Formats a `Cause` as a human-readable string for logging or debugging.
*
* **When to use**
*
* Use to render a whole cause as one human-readable string for logs or
* diagnostics.
*
* **Details**
*
* Delegates to {@link prettyErrors} to convert each reason to an `Error`,
* then joins their stack traces with newlines. Nested `Error.cause` chains
* are rendered inline with indentation:
*
* ```text
* ErrorName: message
*     at ...
*     at ... {
*   [cause]: NestedError: message
*       at ...
* }
* ```
*
* Span annotations are appended to the relevant stack frames when available.
*
* **Gotchas**
*
* Rendering an empty cause produces an empty string because there are no
* errors to render.
*
* **Example** (Rendering a cause)
*
* ```ts import.meta.vitest
* import { Cause } from "effect"
*
* Cause.pretty(Cause.fail("something went wrong")).includes("something went wrong") // => true
* ```
*
* @see {@link prettyErrors} — get the individual `Error` instances
*
* @stability stable
* @category formatting
* @since 2.0.0
*/
const pretty = causePretty;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Exit.js
/**
* Pattern matches on an Exit, handling both success and failure cases.
*
* **When to use**
*
* Use when you need exhaustive handling of both `Exit` success and failure
* outcomes.
*
* **Details**
*
* Calls `onSuccess` with the value if the Exit is a Success, and calls
* `onFailure` with the Cause if the Exit is a Failure.
*
* **Example** (Matching on an Exit)
*
* ```ts import.meta.vitest
* import { Exit } from "effect"
*
* Exit.match(Exit.succeed(42), {
*   onSuccess: (value) => `Got: ${value}`,
*   onFailure: () => "Failed"
* }) // => "Got: 42"
* ```
*
* @see {@link isSuccess} and {@link isFailure} for simple boolean checks
*
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const match$1 = exitMatch;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Deferred.js
const TypeId$1 = "~effect/Deferred";
const DeferredProto = {
	[TypeId$1]: {
		_A: identity,
		_E: identity
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const DeferredImpl = function() {
	this.resumes = void 0;
	this.effect = void 0;
};
DeferredImpl.prototype = DeferredProto;
/**
* Creates an empty `Deferred` synchronously outside the `Effect` runtime.
*
* **When to use**
*
* Use to allocate a `Deferred` synchronously when direct allocation outside
* `Effect` is required.
*
* **Example** (Creating a Deferred unsafely)
*
* ```ts import.meta.vitest
* import { Deferred } from "effect"
*
* const deferred = Deferred.makeUnsafe<number>()
* Deferred.isDoneUnsafe(deferred) // => false
* ```
*
* @stability stable
* @category unsafe
* @since 4.0.0
*/
const makeUnsafe$1 = () => new DeferredImpl();
const _await = (self) => callback((resume) => {
	if (self.effect) return resume(self.effect);
	self.resumes ??= [];
	self.resumes.push(resume);
	return sync$1(() => {
		const resumes = self.resumes;
		if (resumes === void 0) return;
		const index = resumes.indexOf(resume);
		if (index >= 0) resumes.splice(index, 1);
	});
});
/**
* Attempts to complete the `Deferred` synchronously with the specified
* completion effect.
*
* **When to use**
*
* Use to complete a `Deferred` synchronously in low-level code that already has
* the completion effect.
*
* **Details**
*
* This mutates the `Deferred` directly and should be reserved for low-level
* code; prefer the effectful completion APIs when possible. Returns `true` if
* this call completed the `Deferred`, or `false` if it was already completed.
*
* **Example** (Completing a Deferred unsafely)
*
* ```ts import.meta.vitest
* import { Deferred, Effect } from "effect"
*
* const deferred = Deferred.makeUnsafe<number>()
* Deferred.doneUnsafe(deferred, Effect.succeed(42)) // => true
* ```
*
* @stability stable
* @category unsafe
* @since 4.0.0
*/
const doneUnsafe = (self, effect) => {
	if (self.effect) return false;
	self.effect = effect;
	if (self.resumes) {
		const resumes = self.resumes;
		self.resumes = void 0;
		for (let i = 0; i < resumes.length; i++) resumes[i](effect);
	}
	return true;
};

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Scope.js
/**
* Controls how long resources stay open.
*
* A scope is a lifetime boundary. Code can register cleanup effects on it, and
* closing the scope runs those cleanups with the `Exit` value that ended the
* work. Most application code uses higher-level APIs such as `Effect.scoped`
* and `Layer`, while this module is useful when code needs to create, provide,
* fork, close, or inspect scopes directly.
*
* @stability stable
* @since 2.0.0
*/
/**
* Creates a new `Scope` synchronously without wrapping it in an `Effect`.
* This is useful when you need a scope immediately but should be used with caution
* as it doesn't provide the same safety guarantees as the `Effect`-wrapped version.
*
* **When to use**
*
* Use when a scope must be allocated synchronously and the caller will close it
* manually.
*
* **Example** (Creating a scope synchronously)
*
* ```ts import.meta.vitest
* import { Effect, Exit, Scope } from "effect"
*
* const scope = Scope.makeUnsafe("sequential")
* const cleanups: Array<string> = []
* const program = Effect.gen(function*() {
*   yield* Scope.addFinalizer(scope, Effect.sync(() => cleanups.push("Cleanup")))
*   yield* Scope.close(scope, Exit.void)
* })
*
* Effect.runSync(program)
* cleanups // => ["Cleanup"]
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const makeUnsafe = scopeMakeUnsafe;
/**
* Creates a closeable child scope synchronously and registers it with a parent scope.
*
* **When to use**
*
* Use when a child scope must be created synchronously and the caller controls
* both parent and child scope lifetimes.
*
* **Details**
*
* Closing the parent closes the child with the same exit value, and closing the
* child detaches it from the parent. The optional finalizer strategy configures
* the child scope and defaults to `"sequential"` when omitted.
*
* **Example** (Creating a child scope synchronously)
*
* ```ts import.meta.vitest
* import { Effect, Exit, Scope } from "effect"
*
* const cleanups: Array<string> = []
* const program = Effect.gen(function*() {
*   const parentScope = Scope.makeUnsafe("sequential")
*   const childScope = Scope.forkUnsafe(parentScope, "parallel")
*   yield* Scope.addFinalizer(parentScope, Effect.sync(() => cleanups.push("parent")))
*   yield* Scope.addFinalizer(childScope, Effect.sync(() => cleanups.push("child")))
*   yield* Scope.close(childScope, Exit.void)
*   yield* Scope.close(parentScope, Exit.void)
* })
*
* Effect.runSync(program)
* cleanups // => ["child", "parent"]
* ```
*
* @stability stable
* @category combinators
* @since 4.0.0
*/
const forkUnsafe = scopeForkUnsafe;
/**
* Closes a scope and runs its registered finalizers.
*
* **When to use**
*
* Use to close a scope manually with a specific exit value.
*
* **Details**
*
* Finalizers run in the scope's configured order and receive the supplied
* `Exit`.
* By default, finalizers run uninterruptibly, so interrupting the closing fiber
* waits for them to finish; a finalizer can explicitly restore interruptibility.
*
* **Gotchas**
*
* Closing a scope that is already closed returns immediately, even when the
* finalizers of an earlier close are still running.
*
* **Example** (Running scope finalizers)
*
* ```ts import.meta.vitest
* import { Effect, Exit, Scope } from "effect"
*
* const events: Array<string> = []
* const resourceManagement = Effect.gen(function*() {
*   const scope = yield* Scope.make("sequential")
*   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("database")))
*   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("file")))
*   yield* Scope.addFinalizer(scope, Effect.sync(() => events.push("memory")))
*   events.push("work")
*   yield* Scope.close(scope, Exit.succeed("Success!"))
* })
*
* Effect.runSync(resourceManagement)
* events // => ["work", "memory", "file", "database"]
* ```
*
* @stability stable
* @category combinators
* @since 2.0.0
*/
const close = scopeClose;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Layer.js
const TypeId = "~effect/Layer";
const MemoMapTypeId = "~effect/Layer/MemoMap";
const makeMemoMapEntry = (memoMap, layer) => {
	const entry = {
		observers: 0,
		deferred: makeUnsafe$1(),
		scope: makeUnsafe(),
		finalizer: (exit) => suspend(() => {
			if (--entry.observers > 0) return void_;
			memoMap.map.delete(layer);
			return close(entry.scope, exit);
		})
	};
	return entry;
};
const memoMapObserve = (entry, scope) => {
	if (scope.state._tag === "Closed") return false;
	entry.observers++;
	scopeAddFinalizerUnsafe(scope, {}, entry.finalizer);
	return true;
};
const LayerProto = {
	[TypeId]: {
		_ROut: identity,
		_E: identity,
		_RIn: identity
	},
	pipe() {
		return pipeArguments(this, arguments);
	}
};
const fromBuildUnsafe = (build) => {
	const self = Object.create(LayerProto);
	self.build = build;
	return self;
};
/**
* Constructs a `Layer` from a function that uses a `MemoMap` and `Scope` to
* build the layer.
*
* **Details**
*
* The function receives a `MemoMap` for memoization and a `Scope` for resource management.
* A child scope is created, and if the build fails, the child scope is closed.
*
* **Example** (Constructing a layer from a build function)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* const databaseLayer = Layer.fromBuild(() =>
*   Effect.sync(() =>
*     Context.make(Database, {
*       query: (sql: string) => Effect.succeed("result")
*     })
*   )
* )
*
* const program = Database.use((database) => database.query("SELECT 1"))
* Effect.runSync(Effect.provide(program, databaseLayer)) // => "result"
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const fromBuild = (build) => fromBuildUnsafe((memoMap, scope) => {
	const layerScope = forkUnsafe(scope);
	return onExit(build(memoMap, layerScope), (exit) => exit._tag === "Failure" ? close(layerScope, exit) : void_);
});
/**
* Constructs a `Layer` from a function that uses a `MemoMap` and `Scope` to
* build the layer, with automatic memoization.
*
* **Details**
*
* This is similar to `fromBuild` but provides automatic memoization of the layer construction.
* The layer will be memoized based on the provided `MemoMap`.
*
* **Example** (Memoizing layer construction)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* const databaseLayer = Layer.fromBuildMemo(() =>
*   Effect.sync(() =>
*     Context.make(Database, {
*       query: (sql: string) => Effect.succeed("result")
*     })
*   )
* )
*
* const program = Database.use((database) => database.query("SELECT 1"))
* Effect.runSync(Effect.provide(program, databaseLayer)) // => "result"
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const fromBuildMemo = (build) => {
	const self = fromBuild((memoMap, scope) => memoMap.getOrElseMemoize(self, scope, build));
	return self;
};
var MemoMapImpl = class {
	get [MemoMapTypeId]() {
		return MemoMapTypeId;
	}
	parent;
	constructor(parent) {
		this.parent = parent;
	}
	map = /*#__PURE__*/ new Map();
	get(layer, scope) {
		const local = this.map.get(layer);
		if (local) {
			memoMapObserve(local, scope);
			return local.deferred.effect ?? _await(local.deferred);
		}
		return this.parent?.get(layer, scope);
	}
	getOrElseMemoize(layer, scope, build) {
		return suspend(() => {
			let deferred;
			return onExitPrimitive(suspend(() => {
				const existing = this.get(layer, scope);
				if (existing) return existing;
				const entry = makeMemoMapEntry(this, layer);
				if (!memoMapObserve(entry, scope)) return build(this, scope);
				deferred = entry.deferred;
				this.map.set(layer, entry);
				return build(this, entry.scope);
			}), (exit) => {
				if (deferred) doneUnsafe(deferred, exit);
			});
		});
	}
};
/**
* Constructs a `MemoMap` synchronously so it can be used to build additional layers.
*
* **Example** (Creating a memo map unsafely)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* // Create a memo map for manual layer building
* const program = Effect.gen(function*() {
*   const memoMap = Layer.makeMemoMapUnsafe()
*   const scope = yield* Effect.scope
*
*   const dbLayer = Layer.succeed(Database, {
*     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
*   })
*   const context = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
*
*   return Context.get(context, Database)
* })
*
* const database = Effect.runSync(Effect.scoped(program))
* Effect.runSync(database.query("SELECT 1")) // => "result"
* ```
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const makeMemoMapUnsafe = () => new MemoMapImpl();
/**
* Constructs a child `MemoMap` synchronously, allowing it to reuse layers
* already memoized in the parent while isolating any new layer allocations to
* the child map.
*
* **When to use**
*
* Use to synchronously fork a memo map for manual layer building when child
* builds should see parent memoized layers without writing newly built layers
* back to the parent.
*
* @see {@link forkMemoMap} for allocating the child memo map inside `Effect`
* @see {@link makeMemoMapUnsafe} for creating a root memo map without a parent
*
* @stability stable
* @category constructors
* @since 4.0.0
*/
const forkMemoMapUnsafe = (parent) => new MemoMapImpl(parent);
/**
* Context service for the current `MemoMap` used in layer construction.
*
* **When to use**
*
* Use when building custom layer operations that need to access the current
* memoization map from the fiber context.
*
* **Details**
*
* This service wraps a `MemoMap` as a `Context.Service`, making it available
* for dependency injection during layer construction.
*
* @see {@link MemoMap} the memoization map type wrapped by this service
*
* @stability stable
* @category services
* @since 3.13.0
*/
var CurrentMemoMap = class CurrentMemoMap extends (/*#__PURE__*/ Service()("effect/Layer/CurrentMemoMap")) {
	static forkOrCreate(self) {
		const current = getOrUndefined(self, CurrentMemoMap);
		return current ? forkMemoMapUnsafe(current) : makeMemoMapUnsafe();
	}
};
/**
* Builds a layer into an `Effect` value, using the specified `MemoMap` to memoize
* the layer construction.
*
* **Example** (Building layers with an explicit memo map)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* class Logger extends Context.Service<Logger, {
*   readonly log: (msg: string) => Effect.Effect<void>
* }>()("Logger") {}
*
* const logs: Array<string> = []
*
* // Build layers with explicit memoization control
* const program = Effect.gen(function*() {
*   const memoMap = yield* Layer.makeMemoMap
*   const scope = yield* Effect.scope
*
*   // Build database layer with memoization
*   const dbLayer = Layer.succeed(Database, {
*     query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
*   })
*   const dbContext = yield* Layer.buildWithMemoMap(dbLayer, memoMap, scope)
*
*   // Build logger layer with same memoization (reuses memo if same layer)
*   const loggerLayer = Layer.succeed(Logger, {
*     log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(msg)))
*   })
*   const loggerContext = yield* Layer.buildWithMemoMap(
*     loggerLayer,
*     memoMap,
*     scope
*   )
*
*   return {
*     database: Context.get(dbContext, Database),
*     logger: Context.get(loggerContext, Logger)
*   }
* })
*
* const services = Effect.runSync(Effect.scoped(program))
* Effect.runSync(services.logger.log("ready"))
* logs // => ["ready"]
* ```
*
* @stability stable
* @category destructors
* @since 2.0.0
*/
const buildWithMemoMap = /*#__PURE__*/ dual(3, (self, memoMap, scope) => provideService(map$1(suspend(() => self.build(memoMap, scope)), add(CurrentMemoMap, memoMap)), CurrentMemoMap, memoMap));
/**
* Builds a layer using an explicit scope.
*
* **When to use**
*
* Use to control the lifetime of layer resources with a scope supplied by the
* caller.
*
* **Details**
*
* Resources created by the layer are released when the supplied scope is
* closed, unless a resource extends its own scope.
*
* **Example** (Building a layer with an explicit scope)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer, Scope } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* const logs: Array<string> = []
*
* // Build a layer with explicit scope control
* const program = Effect.gen(function*() {
*   const scope = yield* Effect.scope
*
*   const dbLayer = Layer.effect(Database, Effect.gen(function*() {
*     logs.push("Initializing database...")
*     yield* Scope.addFinalizer(
*       scope,
*       Effect.sync(() => logs.push("Database closed"))
*     )
*     return { query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result: ${sql}`)) }
*   }))
*
*   // Build with specific scope - resources tied to this scope
*   const context = yield* Layer.buildWithScope(dbLayer, scope)
*   const database = Context.get(context, Database)
*
*   return yield* database.query("SELECT * FROM users")
*   // Database will be closed when scope is closed
* })
*
* Effect.runSync(Effect.scoped(program)) // => "Result: SELECT * FROM users"
* logs // => ["Initializing database...", "Database closed"]
* ```
*
* @stability stable
* @category destructors
* @since 2.0.0
*/
const buildWithScope = /*#__PURE__*/ dual(2, (self, scope) => withFiber((fiber) => buildWithMemoMap(self, CurrentMemoMap.forkOrCreate(fiber.context), scope)));
/**
* Constructs a layer that provides a single service from an already available
* value.
*
* **When to use**
*
* Use when you need a `Layer` that provides a service from an already
* constructed implementation without effectful acquisition.
*
* **Example** (Creating a layer from a service implementation)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* const DatabaseLayer = Layer.succeed(Database, {
*   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Query result: ${sql}`))
* })
* const program = Database.use((database) => database.query("SELECT 1"))
* Effect.runSync(Effect.provide(program, DatabaseLayer)) // => "Query result: SELECT 1"
* ```
*
* @see {@link sync} for constructing layers from lazy values
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const succeed$1 = function() {
	if (arguments.length === 1) return (resource) => succeedContext(make$2(arguments[0], resource));
	return succeedContext(make$2(arguments[0], arguments[1]));
};
/**
* Constructs a layer that provides all services in an already available
* `Context`.
*
* **When to use**
*
* Use when you need a `Layer` built from an existing `Context`, including when
* you need to provide multiple services at once.
*
* **Details**
*
* This is a more general version of `succeed` that allows you to provide
* multiple services at once through a `Context`.
*
* **Example** (Providing multiple services from a context)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* class Logger extends Context.Service<Logger, {
*   readonly log: (msg: string) => Effect.Effect<void>
* }>()("Logger") {}
*
* const logs: Array<string> = []
* const context = Context.make(Database, {
*   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
* }).pipe(
*   Context.add(Logger, {
*     log: (msg: string) => Effect.sync(() => logs.push(msg))
*   })
* )
*
* const layer = Layer.succeedContext(context)
* const program = Logger.use((logger) => logger.log("ready"))
* Effect.runSync(Effect.provide(program, layer))
* logs // => ["ready"]
* ```
*
* @see {@link succeed} for providing a single service from a value
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const succeedContext = (context) => fromBuildUnsafe(constant(succeed$2(context)));
const mergeAllEffect = (layers, memoMap, scope) => {
	const parentScope = forkUnsafe(scope, "parallel");
	return forEach$1(layers, (layer) => layer.build(memoMap, forkUnsafe(parentScope, "sequential")), { concurrency: layers.length }).pipe(map$1((context) => mergeAll$1(...context)));
};
/**
* Combines all the provided layers concurrently, creating a new layer with
* merged input, error, and output types.
*
* **When to use**
*
* Use when you need to combine multiple independent layers.
*
* **Details**
*
* All layers are built concurrently, and their outputs are merged into a single layer.
*
* If multiple merged layers depend on the same layer value, that dependency is
* shared by default. Reuse a named layer value when you want services to share
* the same resource, such as one database pool.
*
* **Example** (Merging independent layers)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* class Database extends Context.Service<Database, {
*   readonly query: (sql: string) => Effect.Effect<string>
* }>()("Database") {}
*
* class Logger extends Context.Service<Logger, {
*   readonly log: (msg: string) => Effect.Effect<void>
* }>()("Logger") {}
*
* const dbLayer = Layer.succeed(Database, {
*   query: Effect.fn("Database.query")((sql: string) => Effect.succeed("result"))
* })
* const logs: Array<string> = []
* const loggerLayer = Layer.succeed(Logger, {
*   log: Effect.fn("Logger.log")((msg: string) => Effect.sync(() => logs.push(msg)))
* })
*
* const mergedLayer = Layer.mergeAll(dbLayer, loggerLayer)
* const program = Logger.use((logger) => logger.log("ready"))
* Effect.runSync(Effect.provide(program, mergedLayer))
* logs // => ["ready"]
* ```
*
* @see {@link merge} for merging one layer with another layer or array
*
* @stability stable
* @category zipping
* @since 2.0.0
*/
const mergeAll = (...layers) => fromBuildMemo((memoMap, scope) => mergeAllEffect(layers, memoMap, scope));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/internal/layer.js
const provideLayer = (self, layer, options) => scopedWith((scope) => flatMap$1(options?.local ? buildWithMemoMap(layer, makeMemoMapUnsafe(), scope) : buildWithScope(layer, scope), (context) => provideContext(self, context)));
/** @internal */
const provide$1 = /*#__PURE__*/ dual((args) => isEffect(args[0]), (self, source, options) => isContext(source) ? provideContext(self, source) : provideLayer(self, Array.isArray(source) ? mergeAll(...source) : source, options));

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Effect.js
/**
* Combines an iterable or record of effects into one effect whose success shape
* follows the input.
*
* **When to use**
*
* Use to run a known collection of effects and collect results in the same
* tuple, iterable, or record shape.
*
* **Details**
*
* Tuple and iterable inputs collect results in order. Record inputs collect
* results under the same keys. By default, the combined effect fails on the
* first failure; with concurrent execution, effects that have already started
* may be interrupted, while effects not yet started are skipped.
*
* Options:
*
* Use `concurrency` to control sequential or concurrent execution. Use
* `mode: "result"` to run every effect and collect each success or failure as a
* `Result` in the same output shape. Use `discard: true` to ignore successful
* values and return `void`.
*
* **Example** (Collecting tuple results in order)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const tupleOfEffects = [
*   Effect.succeed(42),
*   Effect.succeed("Hello")
* ] as const
*
* //      ┌─── Effect<[number, string], never, never>
* //      ▼
* const resultsAsTuple = Effect.all(tupleOfEffects)
*
* await Effect.runPromise(resultsAsTuple) // => [42, "Hello"]
* ```
*
* **Example** (Collecting iterable results in order)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const iterableOfEffects: Iterable<Effect.Effect<number>> = [1, 2, 3].map(
*   Effect.succeed
* )
*
* //      ┌─── Effect<number[], never, never>
* //      ▼
* const resultsAsArray = Effect.all(iterableOfEffects)
*
* await Effect.runPromise(resultsAsArray) // => [1, 2, 3]
* ```
*
* **Example** (Collecting struct results by key)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const structOfEffects = {
*   a: Effect.succeed(42),
*   b: Effect.succeed("Hello")
* }
*
* //      ┌─── Effect<{ a: number; b: string; }, never, never>
* //      ▼
* const resultsAsStruct = Effect.all(structOfEffects)
*
* await Effect.runPromise(resultsAsStruct) // => { a: 42, b: "Hello" }
* ```
*
* **Example** (Collecting record results by key)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const recordOfEffects: Record<string, Effect.Effect<number>> = {
*   key1: Effect.succeed(1),
*   key2: Effect.succeed(2)
* }
*
* //      ┌─── Effect<{ [x: string]: number; }, never, never>
* //      ▼
* const resultsAsRecord = Effect.all(recordOfEffects)
*
* await Effect.runPromise(resultsAsRecord) // => { key1: 1, key2: 2 }
* ```
*
* **Example** (Stopping on the first failure)
*
* ```ts import.meta.vitest
* import { Effect, Exit } from "effect"
* const output: Array<unknown> = []
* const record = (value: unknown) => Effect.sync(() => { output.push(value) })
*
* const program = Effect.all([
*   Effect.succeed("Task1").pipe(Effect.tap(record)),
*   Effect.fail("Task2: Oh no!").pipe(Effect.tap(record)),
*   // Won't execute due to earlier failure
*   Effect.succeed("Task3").pipe(Effect.tap(record))
* ])
*
* const outcome = await Effect.runPromiseExit(program)
* const observation = [output, outcome] // => [["Task1"], Exit.fail("Task2: Oh no!")]
* ```
*
* @see {@link forEach} for iterating over elements and applying an effect.
* @stability stable
* @category collecting
* @since 2.0.0
*/
const all = all$1;
/**
* Executes an effectful operation for each element in an `Iterable`.
*
* **When to use**
*
* Use to traverse an iterable with an effectful function while preserving
* element order in the collected results.
*
* **Details**
*
* The `forEach` function applies a provided operation to each element in the
* iterable, producing a new effect that returns an array of results.
*
* If any effect fails, the iteration stops immediately (short-circuiting), and
* the error is propagated.
*
* Concurrency:
*
* The `concurrency` option controls how many operations are performed
* concurrently. By default, the operations are performed sequentially.
*
* Discarding Results:
*
* If the `discard` option is set to `true`, the intermediate results are not
* collected, and the final result of the operation is `void`.
*
* **Example** (Mapping over an iterable with effects)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
* const output: Array<unknown> = []
*
* const result = Effect.forEach(
*   [1, 2, 3, 4, 5],
*   (n, index) =>
*     Effect.sync(() => { output.push(`Currently at index ${index}`) }).pipe(Effect.as(n * 2))
* )
*
* void output.push(await Effect.runPromise(result))
* output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", [2, 4, 6, 8, 10]]
* ```
*
* **Example** (Running effects without collecting results)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
* const output: Array<unknown> = []
*
* // Apply effects but discard the results
* const result = Effect.forEach(
*   [1, 2, 3, 4, 5],
*   (n, index) =>
*     Effect.sync(() => { output.push(`Currently at index ${index}`) }).pipe(Effect.as(n * 2)),
*   { discard: true }
* )
*
* void output.push(await Effect.runPromise(result))
* output // => ["Currently at index 0", "Currently at index 1", "Currently at index 2", "Currently at index 3", "Currently at index 4", undefined]
* ```
*
* @see {@link all} for combining multiple effects into one.
* @stability stable
* @category collecting
* @since 2.0.0
*/
const forEach = forEach$1;
/**
* Creates an `Effect` from an asynchronous computation that may throw or
* reject, mapping failures into the error channel.
*
* **When to use**
*
* Use when you need to perform asynchronous operations that might fail, such
* as fetching data from an API, and want thrown exceptions or rejected promises
* captured as Effect errors.
*
* **Details**
*
* The promise thunk is evaluated when the effect runs. If it returns a promise
* that resolves, the resolved value becomes the success value. If the thunk
* throws before returning a promise, or if the returned promise rejects, the
* thrown or rejected value is mapped into the error channel.
*
* Passing the thunk directly maps failures to {@link Cause.UnknownError}.
* Passing `{ try, catch }` uses `catch` to map failures to an error of type
* `E`.
*
* If the thunk declares a parameter, it receives an `AbortSignal` that is
* aborted if the effect is interrupted. The underlying asynchronous operation
* only stops if it observes that signal. Zero-argument thunks do not allocate
* an `AbortController`.
*
* **Gotchas**
*
* If `catch` throws while mapping the error, that thrown value is treated as a
* defect. Return the error value you want in the error channel instead of
* throwing it.
*
* The parameter check reads the thunk's `length` property, which does not
* count a rest parameter or any parameter from the first default value
* onward. `(...args) => ...` and `(signal = fallback) => ...` therefore
* receive `undefined` instead of a signal, as do wrappers that forward
* arguments through rest parameters. Declare the signal as an ordinary
* parameter: `(signal) => ...`.
*
* **Example** (Wrapping a fetch request that may fail)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const getTodo = (id: number) =>
*   Effect.tryPromise(() => Promise.resolve({ id, completed: false }))
*
* //      ┌─── Effect<{ id: number; completed: boolean }, UnknownError, never>
* //      ▼
* const program = getTodo(1)
* await Effect.runPromise(program) // => { id: 1, completed: false }
* ```
*
* **Example** (Mapping Promise rejections to a tagged error)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class TodoFetchError extends Data.TaggedError("TodoFetchError")<{ readonly cause: unknown }> {}
*
* const getTodo = (id: number) =>
*   Effect.tryPromise({
*     try: () => Promise.reject(`Todo ${id} is unavailable`),
*     // remap the error
*     catch: (cause) => new TodoFetchError({ cause })
*   })
*
* //      ┌─── Effect<never, TodoFetchError, never>
* //      ▼
* const program = Effect.flip(getTodo(1))
* const error = await Effect.runPromise(program)
* error._tag // => "TodoFetchError"
* ```
*
* @see {@link promise} if the effectful computation is asynchronous and does not throw errors.
* @stability stable
* @category constructors
* @since 2.0.0
*/
const tryPromise = tryPromise$1;
/**
* Creates an `Effect` that always succeeds with a given value.
*
* **When to use**
*
* Use when an effect should complete successfully with a specific value without any errors
* or external dependencies.
*
* **Example** (Creating a successful effect)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* // Creating an effect that represents a successful scenario
* //
* //      ┌─── Effect<number, never, never>
* //      ▼
* const success = Effect.succeed(42)
* Effect.runSync(success) // => 42
* ```
*
* @see {@link fail} to create an effect that represents a failure.
* @stability stable
* @category constructors
* @since 2.0.0
*/
const succeed = succeed$2;
/**
* Creates an `Effect` that represents a synchronous side-effectful computation.
*
* **When to use**
*
* Use when you need to wrap a synchronous side-effectful operation that is not
* expected to throw.
*
* **Details**
*
* The provided function is evaluated lazily when the effect runs.
*
* **Gotchas**
*
* The function must not throw. If it throws, the thrown value is treated as a
* defect, not as a typed failure. Use `try` when throwing is expected.
*
* **Example** (Capturing synchronous logging in an Effect)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
* const output: Array<unknown> = []
*
* const log = (message: string) =>
*   Effect.sync(() => {
*     void output.push(message) // side effect
*   })
*
* //      ┌─── Effect<void, never, never>
* //      ▼
* const program = log("Hello, World!")
* Effect.runSync(program)
* output // => ["Hello, World!"]
* ```
*
* @see {@link try_ | try} for a version that can handle failures.
* @stability stable
* @category constructors
* @since 2.0.0
*/
const sync = sync$1;
/**
* Provides a way to write effectful code using generator functions, simplifying
* control flow and error handling.
*
* **When to use**
*
* Use when you want to write effectful code that looks and behaves like
* synchronous code, while still handling asynchronous tasks, errors, and complex
* control flow such as loops and conditions.
*
* Generator functions work similarly to `async/await` but keep errors,
* requirements, and interruption in the Effect type. You can `yield*` values
* from effects and return the final result at the end.
*
* **Example** (Sequencing effects with generators)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
*
* const addServiceCharge = (amount: number) => amount + 1
*
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, DiscountRateError> =>
*   discountRate === 0
*     ? Effect.fail(new DiscountRateError())
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const fetchDiscountRate = Effect.promise(() => Promise.resolve(5))
*
* export const program = Effect.gen(function*() {
*   const transactionAmount = yield* fetchTransactionAmount
*   const discountRate = yield* fetchDiscountRate
*   const discountedAmount = yield* applyDiscount(
*     transactionAmount,
*     discountRate
*   )
*   const finalAmount = addServiceCharge(discountedAmount)
*   return `Final amount to charge: ${finalAmount}`
* })
*
* await Effect.runPromise(program) // => "Final amount to charge: 96"
* ```
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
const gen = gen$1;
/**
* Creates an `Effect` that represents a recoverable error.
*
* **When to use**
*
* Use to explicitly signal a recoverable error in an `Effect`.
*
* **Details**
*
* The error keeps propagating unless it is handled. You can handle tagged
* errors with functions like {@link catchTag} or {@link catchTags}.
*
* **Example** (Creating a failed effect)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class OperationFailedError extends Data.TaggedError("OperationFailedError")<{}> {}
*
* //      ┌─── Effect<never, OperationFailedError, never>
* //      ▼
* const failure = Effect.fail(
*   new OperationFailedError()
* )
* Effect.runSync(Effect.flip(failure))._tag // => "OperationFailedError"
* ```
*
* @see {@link succeed} to create an effect that represents a successful value.
* @stability stable
* @category constructors
* @since 2.0.0
*/
const fail = fail$1;
/**
* Converts a `Result` to an `Effect`.
*
* **Example** (Converting a Result into an Effect)
*
* ```ts import.meta.vitest
* import { Effect, Result } from "effect"
* const output: Array<unknown> = []
*
* const success = Result.succeed(42)
* const failure = Result.fail("Something went wrong")
*
* const effect1 = Effect.fromResult(success)
* const effect2 = Effect.fromResult(failure)
*
* void output.push(Effect.runSync(effect1))
* void output.push(Effect.runSync(Effect.flip(effect2)))
* output // => [42, "Something went wrong"]
* ```
*
* @stability stable
* @category converting
* @since 4.0.0
*/
const fromResult = fromResult$1;
/**
* Converts an `Option` into an `Effect`.
*
* **When to use**
*
* Use when absence should become a typed `NoSuchElementError` in the effect error
* channel.
*
* **Details**
*
* `Option.some` becomes a successful effect with the contained value, while
* `Option.none` becomes a failed effect. By default the failure is a
* `NoSuchElementError`, but you can provide an `onNone` callback to customize
* the error value. For `Option.none`, `onNone` is evaluated on each execution,
* not when the effect is constructed. It is never called for `Option.some`.
* If `onNone` throws, the effect dies with the thrown value as a defect.
*
* **Example** (Converting an Option into an Effect)
*
* ```ts import.meta.vitest
* import { Effect, Option } from "effect"
* const output: Array<unknown> = []
*
* const some = Option.some(42)
* const none = Option.none()
*
* const effect1 = Effect.fromOption(some)
* const effect2 = Effect.fromOption(none)
* const effect3 = Effect.fromOption(none, () => new Error("missing"))
*
* void output.push(Effect.runSync(effect1))
* void output.push(Effect.runSync(Effect.flip(effect2))._tag)
* void output.push(Effect.runSync(Effect.flip(effect3)).message)
* output // => [42, "NoSuchElementError", "missing"]
* ```
*
* @stability stable
* @category converting
* @since 4.0.0
*/
const fromOption = fromOption$1;
/**
* Chains effects to produce new `Effect` instances, useful for combining
* operations that depend on previous results.
*
* **When to use**
*
* Use when you need to chain multiple effects, ensuring that each
* step produces a new `Effect` while flattening any nested effects that may
* occur.
*
* **Details**
*
* `flatMap` lets you sequence effects so that the result of one effect can be
* used in the next step. It is similar to `flatMap` used with arrays but works
* specifically with `Effect` instances, allowing you to avoid deeply nested
* effect structures.
*
* Since effects are immutable, `flatMap` always returns a new effect instead of
* changing the original one.
*
* **Example** (Choosing flatMap syntax variants)
*
* ```ts import.meta.vitest
* import { Effect, pipe } from "effect"
* const output: Array<unknown> = []
*
* const myEffect = Effect.succeed(1)
* const transformation = (n: number) => Effect.succeed(n + 1)
*
* const flatMappedWithPipe = pipe(myEffect, Effect.flatMap(transformation))
* const flatMappedWithDataFirst = Effect.flatMap(myEffect, transformation)
* const flatMappedWithMethod = myEffect.pipe(Effect.flatMap(transformation))
*
* void output.push(Effect.runSync(Effect.all([
*   flatMappedWithPipe,
*   flatMappedWithDataFirst,
*   flatMappedWithMethod
* ])))
* output // => [[2, 2, 2]]
* ```
*
* **Example** (Sequencing dependent effects)
*
* ```ts import.meta.vitest
* import { Data, Effect, pipe } from "effect"
*
* class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
*
* // Function to apply a discount safely to a transaction amount
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, DiscountRateError> =>
*   discountRate === 0
*     ? Effect.fail(new DiscountRateError())
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* // Simulated asynchronous task to fetch a transaction amount from database
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* // Chaining the fetch and discount application using `flatMap`
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   Effect.flatMap((amount) => applyDiscount(amount, 5))
* )
*
* await Effect.runPromise(finalAmount) // => 95
* ```
*
* @see {@link tap} for a version that ignores the result of the effect.
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const flatMap = flatMap$1;
/**
* Runs this effect and then runs another effect, optionally using the first
* effect's success value to choose the next effect.
*
* **When to use**
*
* Use when you need one effect to run after another and the second effect may
* depend on the first effect's success value.
*
* **Details**
*
* When the second argument is an `Effect`, the first success value is discarded
* and the returned effect produces the second effect's value. When the second
* argument is a function, it receives the first success value and must return
* the next `Effect`.
*
* Failures or requirements from either effect are preserved in the returned
* effect.
*
* **Example** (Choosing andThen syntax variants)
*
* ```ts import.meta.vitest
* import { Effect, pipe } from "effect"
* const output: Array<unknown> = []
*
* const myEffect = Effect.succeed(1)
* const anotherEffect = Effect.succeed("done")
*
* const transformedWithPipe = pipe(myEffect, Effect.andThen(anotherEffect))
* const transformedWithDataFirst = Effect.andThen(myEffect, anotherEffect)
* const transformedWithMethod = myEffect.pipe(Effect.andThen(anotherEffect))
*
* void output.push(Effect.runSync(Effect.all([
*   transformedWithPipe,
*   transformedWithDataFirst,
*   transformedWithMethod
* ])))
* output // => [['done', 'done', 'done']]
* ```
*
* **Example** (Sequencing a discount calculation after fetching a total)
*
* ```ts import.meta.vitest
* import { Data, Effect, pipe } from "effect"
*
* class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
*
* // Function to apply a discount safely to a transaction amount
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, DiscountRateError> =>
*   discountRate === 0
*     ? Effect.fail(new DiscountRateError())
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* // Simulated asynchronous task to fetch a transaction amount from database
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* // Using Effect.map and Effect.flatMap
* const result1 = pipe(
*   fetchTransactionAmount,
*   Effect.map((amount) => amount * 2),
*   Effect.flatMap((amount) => applyDiscount(amount, 5))
* )
*
* await Effect.runPromise(result1) // => 190
*
* // Using Effect.andThen
* const result2 = pipe(
*   fetchTransactionAmount,
*   Effect.andThen((amount) => Effect.succeed(amount * 2)),
*   Effect.andThen((amount) => applyDiscount(amount, 5))
* )
*
* await Effect.runPromise(result2) // => 190
* ```
*
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const andThen = andThen$1;
/**
* Runs a side effect with the result of an effect without changing the original
* value.
*
* **When to use**
*
* Use when you need to run an effectful observation, such as logging or
* tracking, while passing the original success value to the next step.
*
* **Details**
*
* `tap` works similarly to `flatMap`, but it ignores the result of the function
* passed to it. The value from the previous effect remains available for the
* next part of the chain. Note that if the side effect fails, the entire chain
* will fail too.
*
* **Example** (Logging a step in a pipeline)
*
* ```ts import.meta.vitest
* import { Data, Effect, pipe } from "effect"
* const output: Array<unknown> = []
*
* class DiscountRateError extends Data.TaggedError("DiscountRateError")<{}> {}
*
* // Function to apply a discount safely to a transaction amount
* const applyDiscount = (
*   total: number,
*   discountRate: number
* ): Effect.Effect<number, DiscountRateError> =>
*   discountRate === 0
*     ? Effect.fail(new DiscountRateError())
*     : Effect.succeed(total - (total * discountRate) / 100)
*
* // Simulated asynchronous task to fetch a transaction amount from database
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   // Log the fetched transaction amount
*   Effect.tap((amount) => Effect.sync(() => { output.push(`Apply a discount to: ${amount}`) })),
*   // `amount` is still available!
*   Effect.flatMap((amount) => applyDiscount(amount, 5))
* )
*
* void output.push(await Effect.runPromise(finalAmount))
* output // => ["Apply a discount to: 100", 95]
* ```
*
* @stability stable
* @category sequencing
* @since 2.0.0
*/
const tap = tap$1;
/**
* Converts both success and failure of an `Effect` into a `Result` type.
*
* **When to use**
*
* Use when you want an `Effect`'s typed failures to be handled as `Result`
* data while preserving the original error value.
*
* **Details**
*
* This function converts an effect that may fail into an effect that always
* succeeds, wrapping the outcome in a `Result` type. The result will be
* `Result.Failure` if the effect fails, containing the recoverable error, or
* `Result.Success` if it succeeds, containing the result.
*
* Using this function, you can handle recoverable errors explicitly without
* causing the effect to fail. This is particularly useful in scenarios where
* you want to chain effects and manage both success and failure in the same
* logical flow.
*
* The resulting effect cannot fail directly because all recoverable failures
* are represented inside the `Result` type.
*
* **Gotchas**
*
* `result` only captures typed, recoverable failures. If the cause contains a
* defect, nothing is captured and every typed error is converted to a defect,
* preserving reason order and interrupts. A cause with only interruptions
* still fails the effect, but an interruption alongside a typed error does not
* prevent capture. The first typed error becomes a `Result.Failure` and the
* interruption is discarded.
*
* **Example** (Capturing success or failure as Result)
*
* ```ts import.meta.vitest
* import { Effect, Result } from "effect"
*
* const success = Effect.succeed(42)
* const failure = Effect.fail("Something went wrong")
*
* const program1 = Effect.result(success)
* const program2 = Effect.result(failure)
*
* Effect.runSync(program1) // => Result.succeed(42)
*
* Effect.runSync(program2) // => Result.fail("Something went wrong")
* ```
*
* @see {@link option} for a version that uses `Option` instead.
* @see {@link exit} for a version that encapsulates both recoverable errors and defects in an `Exit`.
*
* @stability stable
* @category error handling
* @since 4.0.0
*/
const result = result$1;
/**
* Converts success to `Option.some` and failure to `Option.none`.
*
* **When to use**
*
* Use when you only care whether an effect succeeds and want recoverable
* failures represented as `Option.none`.
*
* **Details**
*
* Success values become `Option.some`, recoverable failures become
* `Option.none`, and defects still fail the effect.
*
* **Gotchas**
*
* `option` only captures typed, recoverable failures as `Option.none`. If the
* cause contains a defect, nothing is captured and every typed error is
* converted to a defect, preserving reason order and interrupts. A cause with
* only interruptions still fails the effect, but an interruption alongside a
* typed error does not prevent capture. The effect succeeds with
* `Option.none()` and the interruption is discarded.
*
* `option` also discards typed failure values. Use `result` if the failure
* value matters.
*
* **Example** (Capturing success or failure as Option)
*
* ```ts import.meta.vitest
* import { Effect, Option } from "effect"
*
* const program = Effect.all([
*   Effect.option(Effect.succeed(1)),
*   Effect.option(Effect.fail("missing"))
* ])
*
* Effect.runSync(program) // => [Option.some(1), Option.none()]
* ```
*
* @see {@link result} for a version that uses `Result` instead.
* @see {@link exit} for a version that encapsulates both recoverable errors and defects in an `Exit`.
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const option = option$1;
/**
* Transforms the value inside an effect by applying a function to it.
*
* **When to use**
*
* Use to transform an effect's success value with a function that returns a
* plain value, producing a new effect without changing the original effect's
* typed error or context requirements.
*
* **Details**
*
* `map` takes a function and applies it to the value contained within an
* effect, creating a new effect with the transformed value.
*
* It's important to note that effects are immutable, meaning that the original
* effect is not modified. Instead, a new effect is returned with the updated
* value.
*
* **Example** (Choosing map syntax variants)
*
* ```ts import.meta.vitest
* import { Effect, pipe } from "effect"
* const output: Array<unknown> = []
*
* const myEffect = Effect.succeed(1)
* const transformation = (n: number) => n + 1
*
* const mappedWithPipe = pipe(myEffect, Effect.map(transformation))
* const mappedWithDataFirst = Effect.map(myEffect, transformation)
* const mappedWithMethod = myEffect.pipe(Effect.map(transformation))
*
* void output.push(Effect.runSync(Effect.all([
*   mappedWithPipe,
*   mappedWithDataFirst,
*   mappedWithMethod
* ])))
* output // => [[2, 2, 2]]
* ```
*
* **Example** (Adding a service charge)
*
* ```ts import.meta.vitest
* import { Effect, pipe } from "effect"
*
* const addServiceCharge = (amount: number) => amount + 1
*
* const fetchTransactionAmount = Effect.promise(() => Promise.resolve(100))
*
* const finalAmount = pipe(
*   fetchTransactionAmount,
*   Effect.map(addServiceCharge)
* )
*
* await Effect.runPromise(finalAmount) // => 101
* ```
*
* @see {@link mapError} for a version that operates on the error channel.
* @see {@link mapBoth} for a version that operates on both channels.
* @see {@link flatMap} or {@link andThen} for a version that can return a new effect.
* @stability stable
* @category mapping
* @since 2.0.0
*/
const map = map$1;
/**
* Replaces the value inside an effect with a constant value.
*
* **When to use**
*
* Use to replace a successful value with a constant while preserving failures
* and requirements.
*
* **Details**
*
* `as` allows you to ignore the original value inside an effect and
* replace it with a new constant value.
*
* **Example** (Replacing a success value)
*
* ```ts import.meta.vitest
* import { Effect, pipe } from "effect"
*
* // Replaces the value 5 with the constant "new value"
* const program = pipe(Effect.succeed(5), Effect.as("new value"))
*
* Effect.runSync(program) // => "new value"
* ```
*
* @see {@link map} for deriving the replacement value from the success value
* @see {@link asVoid} for replacing the success value with `void`
*
* @stability stable
* @category mapping
* @since 2.0.0
*/
const as = as$1;
/**
* Maps the success value of an `Effect` to `Some`, preserving failures.
*
* **Example** (Wrapping success in Option.some)
*
* ```ts import.meta.vitest
* import { Effect, Option } from "effect"
*
* const program = Effect.asSome(Effect.succeed(42))
*
* Effect.runSync(program) // => Option.some(42)
* ```
*
* @stability stable
* @category mapping
* @since 2.0.0
*/
const asSome = asSome$1;
/**
* Maps the success value of an `Effect` to `void`, preserving failures.
*
* **Example** (Discarding success values)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const program = Effect.asVoid(Effect.succeed(42))
*
* Effect.runSync(program) // => undefined
* ```
*
* @stability stable
* @category mapping
* @since 2.0.0
*/
const asVoid = asVoid$1;
const catch_ = catch_$1;
/**
* Catches and handles specific errors by their `_tag` field, which is used as a
* discriminator.
*
* **When to use**
*
* Use when you need to recover from one specific tagged error in an effect
* error channel.
*
* **Details**
*
* The error type must have a readonly `_tag` field. `catchTag` matches that
* field and only handles errors with the requested tag.
*
* **Gotchas**
*
* If the cause contains a defect, the handler is skipped and every typed error
* is converted to a defect, preserving reason order and interrupts. An
* interruption alongside a typed error does not prevent recovery.
*
* **Example** (Handling a tagged error)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* class NetworkError {
*   readonly _tag = "NetworkError"
*   constructor(readonly message: string) {}
* }
*
* class ValidationError {
*   readonly _tag = "ValidationError"
*   constructor(readonly message: string) {}
* }
*
* const task: Effect.Effect<string, NetworkError | ValidationError> =
*   Effect.fail(new NetworkError("offline"))
*
* const program = Effect.catchTag(
*   task,
*   "NetworkError",
*   (error) => Effect.succeed(`Recovered from network error: ${error.message}`)
* )
*
* Effect.runSync(program) // => "Recovered from network error: offline"
* ```
*
* @see {@link catchTags} for handling multiple tagged errors in one call
* @see {@link catchIf} for recovering from errors that match a predicate
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const catchTag = catchTag$1;
/**
* Handles multiple errors in a single block of code using their `_tag` field.
*
* **When to use**
*
* Use when one recovery step should handle several tagged error types by
* matching their readonly `_tag` fields.
*
* **Details**
*
* Pass a handler table whose keys are tags, plus an optional fallback for
* unmatched errors.
*
* The error type must have a readonly `_tag` field to use `catchTags`. This
* field is used to identify and match errors.
*
* **Gotchas**
*
* If the cause contains a defect, the handler is skipped and every typed error
* is converted to a defect, preserving reason order and interrupts. An
* interruption alongside a typed error does not prevent recovery.
*
* **Example** (Handling multiple tagged errors)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* // Define tagged error types
* class ValidationError extends Data.TaggedError("ValidationError")<{
*   message: string
* }> {}
*
* class NetworkError extends Data.TaggedError("NetworkError")<{
*   statusCode: number
* }> {}
*
* // An effect that might fail with multiple error types
* const program: Effect.Effect<string, ValidationError | NetworkError> =
*   Effect.fail(new NetworkError({ statusCode: 503 }))
*
* // Handle multiple error types at once
* const handled = Effect.catchTags(program, {
*   ValidationError: (error) =>
*     Effect.succeed(`Validation failed: ${error.message}`),
*   NetworkError: (error) => Effect.succeed(`Network error: ${error.statusCode}`)
* })
*
* Effect.runSync(handled) // => "Network error: 503"
* ```
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const catchTags = catchTags$1;
/**
* Recovers from defects using a provided recovery function.
*
* **When to use**
*
* Use when you need to report or translate defects at integration boundaries.
*
* **Details**
*
* `catchDefect` handles unexpected defects, such as thrown exceptions or
* values passed to `die`, without catching typed failures or interruptions.
*
* When to Recover from Defects:
*
* Defects are unexpected errors that typically should not be recovered from, as
* they often indicate serious issues. In some cases, such as dynamically loaded
* plugins, controlled recovery may be needed.
*
* **Gotchas**
*
* `catchDefect` recovers any cause that contains a defect, including causes
* that also contain typed errors. Typed error handlers such as `catch` skip
* those causes, so defects always take precedence.
*
* **Example** (Recovering from defects)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
* const output: Array<unknown> = []
*
* // An effect that might throw an unexpected error (defect)
* const program = Effect.sync(() => {
*   throw new Error("Unexpected error")
* })
*
* // Recover from defects only
* const recovered = Effect.catchDefect(program, (defect) => {
*   return Effect.sync(() => { output.push(`Caught defect: ${(defect as Error).message}`) }).pipe(
*     Effect.as("Recovered from defect")
*   )
* })
*
* void output.push(Effect.runSync(recovered))
* output // => ["Caught defect: Unexpected error", "Recovered from defect"]
* ```
*
* @stability stable
* @category error handling
* @since 4.0.0
*/
const catchDefect = catchDefect$1;
/**
* Recovers from specific errors using a `Predicate` or `Refinement`.
*
* **When to use**
*
* Use when you need to recover from errors that match a condition.
*
* **Details**
*
* Use a `Refinement` for type narrowing or a `Predicate` for simple boolean
* matching. Non-matching errors re-fail with the original cause. Defects and
* interrupts are not caught.
*
* **Gotchas**
*
* If the cause contains a defect, the handler is skipped and every typed error
* is converted to a defect, preserving reason order and interrupts. An
* interruption alongside a typed error does not prevent recovery.
*
* **Example** (Recovering when a predicate matches)
*
* ```ts import.meta.vitest
* import { Data, Effect, Filter } from "effect"
*
* class NotFound extends Data.TaggedError("NotFound")<{ id: string }> {}
*
* const program = Effect.fail(new NotFound({ id: "user-1" }))
*
* // With a refinement
* const recovered = program.pipe(
*   Effect.catchIf(
*     (error): error is NotFound => error._tag === "NotFound",
*     (error) => Effect.succeed(`missing:${error.id}`)
*   )
* )
*
* // With a Filter
* const recovered2 = program.pipe(
*   Effect.catchFilter(
*     Filter.tagged("NotFound"),
*     (error) => Effect.succeed(`missing:${error.id}`)
*   )
* )
*
* Effect.runSync(Effect.all([recovered, recovered2])) // => ['missing:user-1', 'missing:user-1']
* ```
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const catchIf = catchIf$1;
/**
* Transforms the failure value of an effect without changing its success value.
*
* **When to use**
*
* Use to translate an `Effect`'s typed failures while leaving successful values
* unchanged.
*
* **Details**
*
* Only the failure channel is transformed. The success channel and requirements
* are preserved.
*
* Maps every typed error in the cause, preserving defects, interrupts and
* reason order. Unlike typed recovery, mapping does not convert errors to defects.
*
* **Example** (Transforming the error channel)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class TaskError extends Data.TaggedError("TaskError")<{ readonly message: string }> {}
*
* //      ┌─── Effect<number, string, never>
* //      ▼
* const simulatedTask = Effect.fail("Oh no!").pipe(Effect.as(1))
*
* //      ┌─── Effect<number, TaskError, never>
* //      ▼
* const mapped = Effect.mapError(
*   simulatedTask,
*   (message) => new TaskError({ message })
* )
* Effect.runSync(Effect.flip(mapped)).message // => "Oh no!"
* ```
*
* @see {@link map} for a version that operates on the success channel.
* @see {@link mapBoth} for a version that operates on both channels.
*
* @stability stable
* @category error handling
* @since 2.0.0
*/
const mapError = mapError$1;
/**
* Filters an effect, failing with a custom error if the predicate fails.
*
* **Details**
*
* This function applies a predicate to the result of an effect. If the
* predicate evaluates to `false`, the effect fails with either a custom
* error (if `orFailWith` is provided) or a `NoSuchElementError`.
*
* **Example** (Filtering with a custom failure)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* // An effect that produces a number
* const program = Effect.succeed(5)
*
* // Filter for even numbers, fail for odd numbers
* const filtered = Effect.filterOrFail(
*   program,
*   (n) => n % 2 === 0,
*   (n) => `Expected even number, got ${n}`
* )
*
* Effect.runSync(Effect.flip(filtered)) // => "Expected even number, got 5"
* ```
*
* @stability stable
* @category filtering
* @since 2.0.0
*/
const filterOrFail = filterOrFail$1;
/**
* Handles both success and failure cases of an effect without performing side
* effects.
*
* **When to use**
*
* Use when you need to fold an `Effect` into a value by handling success and
* failure differently without triggering side effects.
*
* **Details**
*
* `match` lets you define custom handlers for both success and failure
* scenarios. You provide separate functions to handle each case, allowing you
* to process the result if the effect succeeds, or handle the error if the
* effect fails.
*
* **Gotchas**
*
* If the cause contains a defect, the handler is skipped and every typed error
* is converted to a defect, preserving reason order and interrupts. An
* interruption alongside a typed error does not prevent recovery.
*
* **Example** (Matching success and failure values)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}
*
* const success: Effect.Effect<number, ExampleError> = Effect.succeed(42)
*
* const program1 = Effect.match(success, {
*   onFailure: (error) => `failure: ${error.message}`,
*   onSuccess: (value) => `success: ${value}`
* })
*
* // Run and log the result of the successful effect
* Effect.runSync(program1) // => "success: 42"
*
* const failure: Effect.Effect<number, ExampleError> = Effect.fail(
*   new ExampleError({ message: "Uh oh!" })
* )
*
* const program2 = Effect.match(failure, {
*   onFailure: (error) => `failure: ${error.message}`,
*   onSuccess: (value) => `success: ${value}`
* })
*
* // Run and log the result of the failed effect
* Effect.runSync(program2) // => "failure: Uh oh!"
* ```
*
* @see {@link matchEffect} if you need to perform side effects in the handlers.
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const match = match$2;
/**
* Handles both success and failure by running effectful handlers.
*
* **When to use**
*
* Use when you need to handle an `Effect`'s failure or success with handlers
* that return effects.
*
* **Details**
*
* Use `matchEffect` when either branch needs to return an `Effect`, such as
* performing logging, recovery, notification, or other effectful work. The
* returned effect succeeds or fails according to the handler that is run.
*
* **Gotchas**
*
* If the cause contains a defect, the handler is skipped and every typed error
* is converted to a defect, preserving reason order and interrupts. An
* interruption alongside a typed error does not prevent recovery.
*
* **Example** (Matching success and failure with effectful handlers)
*
* ```ts import.meta.vitest
* import { Data, Effect } from "effect"
*
* class ExampleError extends Data.TaggedError("ExampleError")<{ readonly message: string }> {}
*
* const success: Effect.Effect<number, ExampleError> = Effect.succeed(42)
* const failure: Effect.Effect<number, ExampleError> = Effect.fail(
*   new ExampleError({ message: "Uh oh!" })
* )
*
* const program1 = Effect.matchEffect(success, {
*   onFailure: (error) =>
*     Effect.succeed(`failure: ${error.message}`),
*   onSuccess: (value) =>
*     Effect.succeed(`success: ${value}`)
* })
*
* Effect.runSync(program1) // => "success: 42"
*
* const program2 = Effect.matchEffect(failure, {
*   onFailure: (error) =>
*     Effect.succeed(`failure: ${error.message}`),
*   onSuccess: (value) =>
*     Effect.succeed(`success: ${value}`)
* })
*
* Effect.runSync(program2) // => "failure: Uh oh!"
* ```
*
* @see {@link match} if you don't need side effects and only want to handle the
* result or failure.
* @stability stable
* @category pattern matching
* @since 2.0.0
*/
const matchEffect = matchEffect$1;
/**
* Provides dependencies to an effect using layers or a context. A layer already
* built by an enclosing `provide` or runtime is reused. Sibling `provide` calls
* build their own copies. Use `options.local` to build a fresh layer subtree.
*
* **Example** (Providing dependencies with a layer)
*
* ```ts import.meta.vitest
* import { Context, Effect, Layer } from "effect"
*
* interface Database {
*   readonly query: (sql: string) => Effect.Effect<string>
* }
*
* const Database = Context.Service<Database>("Database")
*
* const DatabaseLayer = Layer.succeed(Database)({
*   query: Effect.fn("Database.query")((sql: string) => Effect.succeed(`Result for: ${sql}`))
* })
*
* const program = Effect.gen(function*() {
*   const db = yield* Database
*   return yield* db.query("SELECT * FROM users")
* })
*
* const provided = Effect.provide(program, DatabaseLayer)
*
* await Effect.runPromise(provided) // => "Result for: SELECT * FROM users"
* ```
*
* @stability stable
* @category providing services
* @since 2.0.0
*/
const provide = provide$1;
/**
* Returns an effect that, if this effect _starts_ execution, then the
* specified `finalizer` is guaranteed to be executed, whether this effect
* succeeds, fails, or is interrupted.
*
* **Details**
*
* For use cases that need access to the effect's result, see `onExit`.
*
* Finalizers offer very powerful guarantees, but they are low-level, and
* should generally not be used for releasing resources. For higher-level
* logic built on `ensuring`, see the `acquireRelease` family of methods.
*
* **Example** (Always running cleanup)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
* const output: Array<unknown> = []
*
* const task = Effect.gen(function*() {
*   yield* Effect.sync(() => { output.push("Task started") })
*   yield* Effect.sync(() => { output.push("Task completed") })
*   return 42
* })
*
* // Ensure cleanup always runs, regardless of success or failure
* const program = Effect.ensuring(
*   task,
*   Effect.sync(() => { output.push("Cleanup: This always runs!") })
* )
*
* void output.push(Effect.runSync(program))
* output // => ["Task started", "Task completed", "Cleanup: This always runs!", 42]
* ```
*
* @stability stable
* @category resource management
* @since 2.0.0
*/
const ensuring = ensuring$1;
/**
* Runs an effect and returns a `Promise` that resolves to an `Exit`, which
* represents the outcome (success or failure) of the effect.
*
* **When to use**
*
* Use when you need to determine if an effect succeeded
* or failed, including any defects, and you want to work with a `Promise`.
*
* **Details**
*
* The `Exit` type represents the result of the effect. Successful effects are
* wrapped in `Success`, and failed effects are wrapped in `Failure` with a
* `Cause`.
*
* **Example** (Observing promise results as Exit)
*
* ```ts import.meta.vitest
* import { Effect, Exit } from "effect"
*
* // Execute a successful effect and get the Exit result as a Promise
* await Effect.runPromiseExit(Effect.succeed(1)) // => Exit.succeed(1)
*
* // Execute a failing effect and get the Exit result as a Promise
* await Effect.runPromiseExit(Effect.fail("my error")) // => Exit.fail("my error")
* ```
*
* @see {@link runPromise} for a version that rejects on failure.
*
* @stability stable
* @category running
* @since 2.0.0
*/
const runPromiseExit = runPromiseExit$1;
/**
* Creates an Effect-returning function without tracing.
*
* **When to use**
*
* Use when you are defining a reusable Effect function whose implementation
* would otherwise be a normal function returning {@link gen}, especially when
* tracing spans or stack-frame capture are not needed.
*
* **Details**
*
* Compared to a plain function that returns {@link gen}, `Effect.fnUntraced`
* reuses the generator body instead of allocating a fresh generator closure
* around the arguments on every call. It does not record an Effect stack-frame
* boundary and does not create tracing spans. Use {@link fn} when you need
* those stack frames or spans. Additional arguments after the generator body
* act like `pipe` transforms: each transform receives the previous result and
* the original function arguments. Generator bodies may declare a `this`
* parameter; pass `{ self }` before the body to bind `this` when the function
* is created. Annotate the generator return type with
* `Effect.fn.Return<A, E, R>` when the produced `Effect` type needs to be
* stated explicitly.
*
* **Example** (Defining untraced effect functions)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fnUntraced(function*(
*   value: string
* ) {
*   return yield* Effect.succeed(value.length)
* })
*
* //      ┌─── Effect.Effect<number>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => 5
* ```
*
* **Example** (Transforming the returned Effect)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fnUntraced(
*   function*(value: string) {
*     return yield* Effect.succeed(value.length)
*   },
*   (effect, value) =>
*     effect.pipe(Effect.map((length) => `${value}: ${length}`))
* )
*
* //      ┌─── Effect.Effect<string>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => "hello: 5"
* ```
*
* **Example** (Annotating an untraced non-parametric function)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fnUntraced(function*(
*   value: string
* ): Effect.fn.Return<number> {
*   return yield* Effect.succeed(value.length)
* })
*
* //      ┌─── Effect.Effect<number>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => 5
* ```
*
* **Example** (Annotating an untraced parametric function)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fnUntraced(function*<A>(
*   value: A
* ): Effect.fn.Return<A> {
*   return yield* Effect.succeed(value)
* })
*
* //      ┌─── Effect.Effect<string>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => "hello"
* ```
*
* @stability stable
* @category constructors
* @since 3.12.0
*/
const fnUntraced = fnUntraced$1;
/**
* Creates a reusable traced function from an Effect body.
*
* **When to use**
*
* Use when you are defining a reusable Effect function whose implementation
* would otherwise be a normal function returning {@link gen}, and you want
* tracing spans or stack-frame capture.
*
* **Details**
*
* Compared to a plain function that returns {@link gen}, `Effect.fn` reuses the
* generator body instead of allocating a fresh generator closure around the
* arguments on every call. Call `Effect.fn(body, ...)` for a generic
* stack-frame boundary without creating a span. Call
* `Effect.fn("operationName", options?)(body, ...)` when that boundary should
* have a readable operation name and the returned `Effect` should create a
* tracing span when run. {@link SpanOptionsNoTrace} configures span metadata
* such as attributes, links, parent or root selection, kind, sampling, and log
* level. Additional arguments after the generator body act like `pipe`
* transforms: each transform receives the previous result and the original
* function arguments. When those transforms return an `Effect`, the returned
* effect includes stack-frame metadata and, for the named form, a tracing span.
* Generator bodies may declare a `this` parameter; pass `{ self }` before the
* body to bind `this` when the function is created.
*
* **Example** (Defining traced effect functions)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fn("calculateLength")(function*(value: string) {
*   return yield* Effect.succeed(value.length)
* })
*
* //      ┌─── Effect.Effect<number>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => 5
* ```
*
* **Example** (Transforming the returned Effect)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fn("formatLength")(
*   function*(value: string) {
*     return yield* Effect.succeed(value.length)
*   },
*   (effect, value) =>
*     effect.pipe(Effect.map((length) => `${value}: ${length}`))
* )
*
* //      ┌─── Effect.Effect<string>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => "hello: 5"
* ```
*
* **Example** (Binding this)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* class Counter {
*   count = 0
*
*   increment = Effect.fn("Counter.increment")(
*     { self: this },
*     function*(this: Counter, by: number) {
*       this.count += by
*       return yield* Effect.succeed(this.count)
*     }
*   )
* }
*
* const counter = new Counter()
*
* //      ┌─── Effect.Effect<number>
* //      ▼
* const program = counter.increment(1)
* Effect.runSync(program) // => 1
* ```
*
* **Example** (Annotating a traced non-parametric function)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fn("calculateLength")(function*(
*   value: string
* ): Effect.fn.Return<number> {
*   return yield* Effect.succeed(value.length)
* })
*
* //      ┌─── Effect.Effect<number>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => 5
* ```
*
* **Example** (Annotating a traced parametric function)
*
* ```ts import.meta.vitest
* import { Effect } from "effect"
*
* const f = Effect.fn("succeed")(function*<A>(
*   value: A
* ): Effect.fn.Return<A> {
*   return yield* Effect.succeed(value)
* })
*
* //      ┌─── Effect.Effect<string>
* //      ▼
* const program = f("hello")
* Effect.runSync(program) // => "hello"
* ```
*
* @stability stable
* @category constructors
* @since 3.11.0
*/
const fn = fn$1;

// ../../node_modules/.pnpm/effect@4.1.2/node_modules/effect/dist/Brand.js
/**
* Returns a `Constructor` that **does not apply any runtime checks** and just
* returns the provided value.
*
* **When to use**
*
* Use to create nominal types that allow distinguishing between two values
* of the same type but with different meanings.
*
* @see {@link make} for constructing branded values with validation.
* @see {@link check} for constructing branded values from schema checks.
*
* @stability stable
* @category constructors
* @since 2.0.0
*/
function nominal() {
	return Object.assign((input) => input, {
		option: (input) => some(input),
		result: (input) => succeed$3(input),
		is: (_) => true
	});
}

// ../../packages/worktrunk-mailbox/src/files.ts
/** There is no file at `path`. */
var FileMissing = class extends TaggedError("FileMissing") {};
/** Reading or writing `path` failed. */
var FileError = class extends TaggedError("FileError") {};
/** The write was refused because the file changed, or appeared, since it was read. */
var WriteConflict = class extends TaggedError("WriteConflict") {};
/** The system's folder picker couldn't be shown. */
var PickerFailed = class extends TaggedError("PickerFailed") {};
var Files = class Files extends Service()("worktrunk-mailbox/Files") {
	static layer = (api) => {
		const read = (path, on = null) => tryPromise({
			try: () => on === null ? api.readTextFile(path) : api.readTextFile(path, { on }),
			catch: (cause) => new FileError({
				path,
				cause
			})
		}).pipe(filterOrFail(isNotNull, () => new FileMissing({ path })));
		const create = (path, text) => tryPromise({
			try: () => api.writeTextFile(path, text, null),
			catch: (cause) => new FileError({
				path,
				cause
			})
		}).pipe(asVoid, catchTag("FileError", (failed) => read(path).pipe(matchEffect({
			onSuccess: () => fail(new WriteConflict({ path })),
			onFailure: () => fail(failed)
		}))));
		const replace = (path, text, expected) => tryPromise({
			try: () => api.writeTextFile(path, text, expected),
			catch: (cause) => new FileError({
				path,
				cause
			})
		}).pipe(asVoid, catchTag("FileError", (failed) => option(read(path)).pipe(flatMap((now) => contains(now, expected) ? fail(failed) : fail(new WriteConflict({ path }))))));
		const pickFolder = (prompt) => tryPromise({
			try: () => api.pickFolder({ prompt }),
			catch: (cause) => new PickerFailed({ cause })
		}).pipe(map(fromNullishOr));
		const remove = (path) => tryPromise({
			try: () => api.exec("rm", [
				"-f",
				"--",
				path
			]),
			catch: (cause) => new FileError({
				path,
				cause
			})
		}).pipe(filterOrFail((run) => run.code === 0, (run) => new FileError({
			path,
			cause: run.stderr.trim()
		})), asVoid);
		return succeed$1(Files, Files.of({
			read,
			create,
			replace,
			remove,
			pickFolder
		}));
	};
};

// ../../packages/worktrunk-mailbox/src/json.ts
/** `text` as JSON, or the parser's message. */
const parseJson = (text) => try_({
	try: () => JSON.parse(text),
	catch: (error) => error instanceof Error ? error.message : String(error)
});
/** The value at `path` inside nested objects, or undefined. */
const at = (value, ...path) => path.reduce((inner, key) => isObject(inner) ? inner[key] : void 0, value);
/** An object's fields; anything else has none. */
const fields = (value) => isObject(value) ? value : {};
/** A finite number, else none. */
const finite = (value) => isNumber(value) && Number.isFinite(value) ? some(value) : none();
/** A string, else none. */
const text = (value) => isString(value) ? some(value) : none();
/** A boolean, else none. */
const bool = (value) => isBoolean(value) ? some(value) : none();
/** A list whose every item `read` accepts, else none. */
const listOf$2 = (value, read) => Array.isArray(value) ? all$2(value.map(read)) : none();
/** A string or null, else none. */
const textOrNull = (value) => value === null ? some(null) : text(value);

// ../../packages/worktrunk-mailbox/src/layout.ts
/**
* Every role a copy of the worktrunk mod plays, as its props' `role` names it. One mod
* folder serves them all: layout blocks show the side `panel` (no role) and the tab-bar
* `toggle` that shows and hides it; overlays are a `menu`, a `confirm` dialog, the `new`
* worktree dialog, the `settings` dialog, and a job window's `titlebar`.
*/
const ROLES = [
	"panel",
	"toggle",
	"menu",
	"confirm",
	"new",
	"settings",
	"titlebar"
];
/** The role a copy plays when its props give none: the side panel. */
const PANEL_ROLE = "panel";
/** The tab-bar button that shows and hides the panel. */
const TOGGLE_ROLE = "toggle";
/**
* The role a copy of the mod plays, from the props its layout block or overlay gave
* (`{ role: "toggle" }`): no role means the panel, and a name that isn't a role is none.
*/
const roleOf = (props) => match$5(text(at(props, "role")), {
	onNone: () => some(PANEL_ROLE),
	onSome: (role) => fromNullishOr(ROLES.find((known) => known === role))
});
const findIn = (node, mod, role, hiddenAbove) => {
	const hidden = hiddenAbove || at(node, "hidden") === true;
	if (at(node, "content", "mod") === mod && contains(roleOf(at(node, "content", "props")), role)) return map$3(text(at(node, "id")), (id) => ({
		id,
		hidden
	}));
	const children = fields(node).children;
	return (Array.isArray(children) ? children : []).reduce((found, child) => isSome(found) ? found : findIn(child, mod, role, hidden), none());
};
/**
* The first block in `layout` that shows `mod` as the panel, with whether it is hidden.
* Blocks showing the mod in another role (the tab-bar toggle) are skipped.
*/
const findModBlock = (layout, mod) => findRoleBlock(layout, mod, PANEL_ROLE);
/** The first block in `layout` that shows `mod` in `role`, with whether it is hidden. */
const findRoleBlock = (layout, mod, role) => findIn(layout, mod, role, false);

// ../../packages/worktrunk-mailbox/src/mailbox.ts
/** The shared-state key the panel of the worktrunk mod `panelMod` reads requests from. */
const requestKey = (panelMod) => `${panelMod}.request.v1`;
/** Every SpaceAct, for readers of a request. */
const SPACE_ACTS = [
	"NewOrOpen",
	"Open",
	"Merge",
	"Remove"
];
/** The shared-state key the panel of the worktrunk mod `panelMod` publishes space groups at. */
const groupsKey = (panelMod) => `${panelMod}.groups.v1`;

// src/machines.ts
/** This machine: the one the Herdr app runs on. */
const THIS_MACHINE = null;
/** What the panel calls `machine`: Herdr's name for it, or "this machine". */
const machineName = (machine) => machine ?? "this machine";
const RepoKey = nominal();
/**
* The key a repo is kept under (lists, CI, folded state): its folder on this machine, else
* `<machine>:<folder>`. A folder is absolute, so no key from another machine starts with
* `/` the way this machine's do.
*/
const repoKey = (repo) => RepoKey(repo.machine === null ? repo.root : `${repo.machine}:${repo.root}`);
/**
* The repo a `repoKey` names. Herdr's machine names never hold `/` (its ids use
* `<machine>/` as a prefix), so the first `/` starts the folder.
*/
const repoOfKey = (key) => {
	const slash = key.indexOf("/");
	return slash <= 0 ? {
		machine: null,
		root: key
	} : {
		machine: key.slice(0, slash - 1),
		root: key.slice(slash)
	};
};
/** Herdr's machine list (`machines()`) by machine. */
const machineStates = (list) => new Map(list.map((machine) => [machine.name, machine.layout]));
/**
* What a machine's state says before anything runs there; none when it can be read. This
* machine is always read: its commands run here, whatever its layout's state.
*/
const statusOf$1 = (states, machine) => {
	switch (machine === null ? "ready" : states.get(machine)) {
		case "loading": return some({ _tag: "Connecting" });
		case "unavailable": return some({
			_tag: "Down",
			reason: "Herdr can't reach it"
		});
		default: return none();
	}
};
/** `path` with `home` at its start written as `~`, the way the settings file keeps folders. */
const tildePath = (path, home) => path === home ? "~" : path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
/**
* A folder on its machine, for a label: on another machine `<machine>: <folder>`; on
* this one the folder alone (`~` for `home`), or after "this machine" with `nameHere`.
*/
const locatedLabel = ({ machine, folder }, options = {}) => {
	if (machine !== null || options.nameHere === true) return `${machineName(machine)}: ${folder}`;
	return options.home === void 0 ? folder : tildePath(folder, options.home);
};

// src/settings.ts
const DEFAULT_SETTINGS = {
	folders: [],
	depth: 4,
	skip: ["node_modules", ".cache"],
	hidden: [],
	noWrapper: false
};
const isFolderEntry = (value) => isObject(value) && isString(value.path) && (value.name === void 0 || isString(value.name)) && (value.machine === void 0 || isString(value.machine));
const isHiddenEntry = (value) => isString(value) || isObject(value) && isString(value.machine) && isString(value.path);
const listOf$1 = (value, item) => Array.isArray(value) && value.every(item);
/** The file's shape, or what is wrong with it. A wrong shape is never half read. */
const readSettingsFile = (value) => {
	if (!isObject(value)) return fail$2("expected a JSON object");
	const { folders, depth, skip, hidden, noWrapper } = value;
	if (folders !== void 0 && !listOf$1(folders, isFolderEntry)) return fail$2("\"folders\" must be a list of { \"name\", \"path\" }");
	if (depth !== void 0 && isNone(finite(depth))) return fail$2("\"depth\" must be a number");
	if (skip !== void 0 && !listOf$1(skip, isString)) return fail$2("\"skip\" must be a list of folder names");
	if (hidden !== void 0 && !listOf$1(hidden, isHiddenEntry)) return fail$2("\"hidden\" must be a list of repo folders");
	if (noWrapper !== void 0 && !isBoolean(noWrapper)) return fail$2("\"noWrapper\" must be true or false");
	return succeed$3({
		...folders === void 0 ? {} : { folders },
		...isNumber(depth) ? { depth } : {},
		...skip === void 0 ? {} : { skip },
		...hidden === void 0 ? {} : { hidden },
		...noWrapper === void 0 ? {} : { noWrapper }
	});
};
/** A folder's last path segment, the name a folder gets when it has none. */
const lastSegment = (path) => path.split("/").filter((part) => part !== "").at(-1) ?? path;
/** `path` with a leading `~` turned into `home`. */
const expandHome = (path, home) => path === "~" ? home : path.startsWith("~/") ? `${home}${path.slice(1)}` : path;
const trimSlashes = (path) => path.trim().replace(/\/+$/, "");
const clampDepth = (depth) => Math.min(8, Math.max(1, Math.round(depth)));
const normalize = (file) => ({
	folders: (file.folders ?? []).flatMap((folder) => {
		const path = trimSlashes(folder.path);
		if (path === "") return [];
		const name = folder.name?.trim() ?? "";
		return [{
			name: name === "" ? lastSegment(path) : name,
			path,
			machine: folder.machine ?? null
		}];
	}),
	depth: file.depth === void 0 ? DEFAULT_SETTINGS.depth : clampDepth(file.depth),
	skip: file.skip === void 0 ? DEFAULT_SETTINGS.skip : file.skip.map((name) => name.trim()).filter((name) => name !== ""),
	hidden: (file.hidden ?? []).map((entry) => isString(entry) ? {
		machine: null,
		root: entry
	} : {
		machine: entry.machine,
		root: entry.path
	}).filter((repo) => repo.root !== ""),
	noWrapper: file.noWrapper ?? DEFAULT_SETTINGS.noWrapper
});
/**
* The settings in `text` (the file's contents, null when there is none). A file that
* doesn't parse, or has the wrong shape, gives the defaults and the reason, so the panel
* keeps working and says why.
*/
const parseSettings = (text, fileName) => {
	if (text === null || text.trim() === "") return {
		settings: DEFAULT_SETTINGS,
		error: none()
	};
	return match$4(flatMap$2(parseJson(text), readSettingsFile), {
		onSuccess: (file) => ({
			settings: normalize(file),
			error: none()
		}),
		onFailure: (message) => ({
			settings: DEFAULT_SETTINGS,
			error: some(`${fileName}: ${message}`)
		})
	});
};
/** What the file holds: a stable key order and two-space indent, so it reads and diffs well. */
const serializeSettings = ({ folders, depth, skip, hidden, noWrapper }) => {
	const ordered = {
		folders: folders.map(({ name, path, machine }) => machine === null ? {
			name,
			path
		} : {
			name,
			path,
			machine
		}),
		depth,
		skip,
		hidden: hidden.map(({ machine, root }) => machine === null ? root : {
			machine,
			path: root
		}),
		noWrapper
	};
	return `${JSON.stringify(ordered, null, 2)}\n`;
};
/**
* The one-time import of the old `worktrunk` mod's settings, given the settings file's
* text (`current`), the old file's (`legacy`), null for no file, and whether the import
* was settled on an earlier run (`settled`). It never overwrites a settings file.
*/
const planImport = (current, legacy, settled) => {
	if (settled || current !== null) return {
		write: none(),
		settled: true
	};
	const old = parseSettings(legacy, "worktrunk.json");
	return legacy === null || isSome(old.error) ? {
		write: none(),
		settled: false
	} : {
		write: some(serializeSettings(old.settings)),
		settled: true
	};
};
/**
* The settings file's text with `repo` (by machine and folder) hidden, from its text now (null when
* there is none). A file that doesn't parse is never replaced: the result is its error
* instead, so a hand edit in progress is never lost to the defaults. A repo already
* hidden leaves the text as it is.
*/
const hideRepo = (current, repo, fileName) => {
	const { settings, error } = parseSettings(current, fileName);
	if (isSome(error)) return fail$2(error.value);
	if (current !== null && settings.hidden.some((hidden) => repoKey(hidden) === repoKey(repo))) return succeed$3(current);
	return succeed$3(serializeSettings({
		...settings,
		hidden: [...settings.hidden, repo]
	}));
};
/**
* How to save `settings` from the dialog, given the file's text when the dialog opened
* (`opened`) and now (`onDisk`), null when there was no file. A hand edit made since the
* dialog opened is never overwritten: the plan says so instead, and a Write expects the
* opened text, so an edit landing after this check makes the write fail too.
*/
const planSave = (opened, onDisk, settings, fileName) => {
	const before = parseSettings(opened, fileName);
	if (isSome(before.error)) return {
		_tag: "Broken",
		error: before.error.value
	};
	if (onDisk !== opened) return { _tag: "Changed" };
	const text = serializeSettings(settings);
	if (opened !== null && text === serializeSettings(before.settings)) return { _tag: "Unchanged" };
	return {
		_tag: "Write",
		text,
		expected: opened
	};
};
/** The settings with `repo` (by machine and folder) no longer hidden. */
const unhide = (settings, repo) => ({
	...settings,
	hidden: settings.hidden.filter((hidden) => repoKey(hidden) !== repoKey(repo))
});
/**
* The settings with the folder picked at `picked` (on this machine, whose home is `home`)
* added as the last group, named after its last segment and written with `~` under
* `home`. A folder already listed on this machine changes nothing.
*/
const addFolder = (settings, picked, home) => withFolder(settings, null, picked, home);
/**
* The settings with `typed` on `machine` (whose home is `home`) added as the last group,
* named after its last segment and written with `~` under `home`. A blank folder, or one
* already listed on that machine, changes nothing.
*/
const withFolder = (settings, machine, typed, home) => {
	const path = tildePath(trimSlashes(typed), home);
	if (path === "") return settings;
	return settings.folders.some((folder) => folder.machine === machine && expandHome(folder.path, home) === expandHome(path, home)) ? settings : {
		...settings,
		folders: [...settings.folders, {
			name: lastSegment(path),
			path,
			machine
		}]
	};
};
/** The settings with the folder at `index` moved `by` places; past either end, unchanged. */
const moveFolder = (settings, index, by) => {
	const { folders } = settings;
	const to = index + by;
	const inside = (i) => i >= 0 && i < folders.length;
	if (by === 0 || !inside(index) || !inside(to)) return settings;
	const moved = folders.slice(index, index + 1);
	const without = folders.filter((_, i) => i !== index);
	return {
		...settings,
		folders: [
			...without.slice(0, to),
			...moved,
			...without.slice(to)
		]
	};
};
/** The settings without the folder at `index`. */
const removeFolder = (settings, index) => ({
	...settings,
	folders: settings.folders.filter((_, i) => i !== index)
});
/** The skip names as the dialog's field shows them. */
const skipText = (skip) => skip.join(", ");
/**
* The settings with the dialog's fields applied: names trimmed (a blank one is the
* folder's last segment), skip names split on commas, depth kept to 1 to 8.
*/
const withFields = (settings, fields) => ({
	...settings,
	folders: settings.folders.map((folder, i) => {
		const name = (fields.names[i] ?? folder.name).trim();
		return {
			...folder,
			name: name === "" ? lastSegment(folder.path) : name
		};
	}),
	skip: fields.skip.split(",").map((name) => name.trim()).filter((name) => name !== ""),
	depth: clampDepth(fields.depth)
});
/** The machines a group folder can be added on by path: Herdr's machines other than this one. */
const otherMachines = (list) => list.flatMap(({ name }) => name === null ? [] : [name]);
/**
* The settings with the folder typed as `typed` on `machine` (whose home there is `home`)
* added as the last group, as `addFolder` adds one on this machine.
*/
const addFolderOn = (settings, machine, typed, home) => withFolder(settings, machine, typed, home);

// src/repos.ts
/** True when `path` is `root` or inside it. */
const isUnder = (path, root) => path === root || path.startsWith(`${root}/`);
/** The group of a repo inside no group folder. */
const OTHER = "Other";
/**
* The folder `folder` names on its machine: `~` is that machine's home in `homes`. None
* for a `~` folder whose machine's home isn't known.
*/
const folderOn = (folder, homes) => folder.path === "~" || folder.path.startsWith("~/") ? map$3(fromNullishOr(homes.get(folder.machine)), (home) => expandHome(folder.path, home)) : some(folder.path);
/**
* The repo's group: the deepest group folder that holds it, else Other. A folder's `~` is
* its machine's home in `homes`.
*/
const groupOf = ({ machine, root }, folders, homes) => folders.filter((folder) => folder.machine === machine).flatMap((folder) => toArray(folderOn(folder, homes)).map((path) => ({
	name: folder.name,
	path
}))).filter((folder) => isUnder(root, folder.path)).reduce((best, folder) => isSome(best) && best.value.path.length >= folder.path.length ? best : some(folder), none()).pipe(map$3((folder) => folder.name), getOrElse$1(() => OTHER));
const count$1 = (text) => {
	const n = Number(text);
	return Number.isInteger(n) && n > 0 ? n : 1;
};
/**
* The folder scan's output, from the scan run on `machine`: one
* `group folder<TAB>repo<TAB>count` line per repo.
*/
const parseScan = (stdout, machine) => stdout.split("\n").flatMap((line) => {
	const [, root, n] = line.split("	");
	return root ? [{
		machine,
		root,
		count: count$1(n)
	}] : [];
});
/** The group folders the scan found missing: each printed alone on its line. */
const missingFolders = (stdout) => stdout.split("\n").filter((line) => line !== "" && !line.includes("	"));
/** The open spaces' repos, from the lookup run on `machine`: one `repo<TAB>count` line per repo. */
const parseOwners = (stdout, machine) => stdout.split("\n").flatMap((line) => {
	const [root, n] = line.split("	");
	return root && line.includes("	") ? [{
		machine,
		root,
		count: count$1(n)
	}] : [];
});
/**
* The Current repo: the repo the owners script, run on `machine`, names for the focused
* folder, if any.
*/
const currentRepo = (stdout, machine) => fromNullishOr(parseOwners(stdout, machine)[0]);
/**
* Every repo once (by machine and folder), scanned or from an open space, with its group,
* by folder name. An open space's count is fresher than the scan's, so it wins.
*/
const reposFrom = (scanned, owners, folders, homes) => Array.from(new Map([...scanned, ...owners].map((repo) => [repoKey(repo), repo])).values()).map(({ machine, root, count: n }) => ({
	machine,
	root,
	count: n,
	group: groupOf({
		machine,
		root
	}, folders, homes)
})).sort((a, b) => lastSegment(a.root).localeCompare(lastSegment(b.root)));
/** `repos` without the hidden ones (by machine and main checkout folder), in their order. */
const withoutHidden = (repos, hidden) => {
	const keys = new Set(hidden.map(repoKey));
	return repos.filter((repo) => !keys.has(repoKey(repo)));
};

// src/commands.ts
/** The scan's arguments for these settings' group folders on `machine`, `~` from `homes`. */
const scanArgs = (settings, machine, homes) => [
	String(settings.depth),
	settings.skip.map((name) => `/${name}/`).join(""),
	...settings.folders.filter((folder) => folder.machine === machine).flatMap((folder) => toArray(folderOn(folder, homes)))
];
/** argv[0] for `sh -c`: the name the scripts report errors under. */
const SCRIPT_NAME = "worktrunk";
const LOGIN_PATH = `[ -n "$SHELL" ] || {
  printf '%s\\n' "worktrunk: \\$SHELL is empty, so the login shell's PATH is unknown" >&2
  exit 127
}
nl='
'
login_path=$("$SHELL" -l -c 'printf "\\n%s" "$PATH"') || exit
PATH=\${login_path##*"$nl"}; export PATH`;
/** `body` as the arguments to `sh`: `-c`, the script, its name, then `args` as $1... */
const shArgs = (body, args) => [
	"-c",
	`${LOGIN_PATH}\n${body}`,
	SCRIPT_NAME,
	...args
];
/**
* Finds repos under group folders. $1: how deep to go; $2: folder names to skip, each
* wrapped in slashes ("/node_modules//.cache/"); then the group folders. A folder with a
* `.git` folder is a repo (a linked worktree's `.git` is a file, so it never counts). It
* never enters a repo, a symlink, a hidden folder or a skipped name. Prints
* `group folder<TAB>repo<TAB>worktree count` per repo, and a group folder that doesn't
* exist alone on its line.
*/
const SCAN_SCRIPT = `depth=$1; skip=$2; shift 2
walk() {
  local dir=$1 level=$2 child name count
  if [ -d "$dir/.git" ]; then
    count=1
    for child in "$dir"/.git/worktrees/*/; do [ -d "$child" ] && count=$((count + 1)); done
    printf '%s\\t%s\\t%s\\n' "$top" "$dir" "$count"
    return
  fi
  [ "$level" -ge "$depth" ] && return
  for child in "$dir"/*/; do
    child=\${child%/}
    [ -d "$child" ] && [ ! -L "$child" ] || continue
    name=\${child##*/}
    case "$skip" in *"/$name/"*) continue ;; esac
    walk "$child" $((level + 1))
  done
}
for top in "$@"; do
  top=\${top%/}
  if [ -d "$top" ]; then walk "$top" 0; else printf '%s\\n' "$top"; fi
done
exit 0`;
/**
* The repos the given folders are in, through each folder's shared git folder, so a
* folder inside a linked worktree names its repo too. Prints `repo<TAB>worktree count`.
*/
const OWNERS_SCRIPT = `for dir in "$@"; do
  [ -d "$dir" ] || continue
  common=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null) || continue
  case "$common" in
    */.git)
      repo=\${common%/.git}
      printf '%s\\t%s\\n' "$repo" "$(git -C "$repo" worktree list --porcelain 2>/dev/null | grep -c '^worktree ')"
      ;;
  esac
done | sort -u`;
/** Lists the worktrees of the repo at $1. */
const LIST_SCRIPT = "cd \"$1\" && wt list --format=json";
/** How many repos the batched list reads at once. */
const LISTS_AT_ONCE = 4;
/**
* Lists the worktrees of every repo in the arguments, in one run: a few repos at a time,
* each answer kept in a private temp folder, then printed in the arguments' order. Each
* repo's record starts with the ASCII record separator, then `<exit code><TAB><folder>`
* on its own line, then what \`wt list --format=json\` printed: its JSON, or its errors
* when it failed.
*/
const LISTS_SCRIPT = `tmp=$(mktemp -d) || exit
trap 'rm -rf "$tmp"' EXIT
i=0
for repo in "$@"; do
  i=$((i + 1))
  { (cd "$repo" && wt list --format=json) >"$tmp/$i.out" 2>"$tmp/$i.err"; echo $? >"$tmp/$i.code"; } &
  [ $((i % ${LISTS_AT_ONCE})) -eq 0 ] && wait
done
wait
i=0
rs=$(printf '\\036')
for repo in "$@"; do
  i=$((i + 1))
  code=$(cat "$tmp/$i.code" 2>/dev/null) || code=127
  printf '%s%s\\t%s\\n' "$rs" "$code" "$repo"
  if [ "$code" = 0 ]; then cat "$tmp/$i.out"; else cat "$tmp/$i.err"; fi
done`;
/** Lists the worktrees of the repo at $1 with their CI. */
const CI_SCRIPT = `${LIST_SCRIPT} --full`;
/** The local and origin branches of the repo at $1, one full ref name per line. */
const BRANCHES_SCRIPT = "git -C \"$1\" for-each-ref '--format=%(refname)' refs/heads refs/remotes/origin";
/** The branch the folder at $1 is on; nothing when its HEAD is detached. */
const BRANCH_SCRIPT = "git -C \"$1\" branch --show-current";
/** `word` as one literal shell word: single-quoted, with each `'` closed, escaped and reopened. */
const quote = (word) => `'${word.replaceAll("'", "'\\''")}'`;
const wt = ({ noWrapper }) => noWrapper ? "command wt" : "wt";
/** Removes `branches` (names or worktree paths) of the repo whose main checkout is `main`. */
const removeScript = (main, branches, options) => [
	wt(options),
	"-C",
	quote(main),
	"remove",
	"--foreground",
	...branches.map(quote)
].join(" ");
/**
* Merges the worktree into the default branch, then removes it. The merge runs inside
* the worktree; the removal runs from the main checkout and waits until it is done, so
* the worktree's folder is gone when the job ends.
*/
const mergeScript = (target, mode, options) => [[
	wt(options),
	"-C",
	quote(target.path),
	"merge",
	"--no-remove"
].concat(mode === "keep" ? ["--no-squash"] : []).join(" "), removeScript(target.main, [target.branch], options)].join(" && ");
/**
* Removes every batch, each repo's name in bold first. A repo that fails doesn't stop the rest; the script fails at the
* end if any did. Needs an sh-compatible shell.
*/
const cleanupScript = (batches, options) => [
	"fail=0",
	...batches.flatMap((batch) => [`printf '\\033[1m%s\\033[0m\\n' ${quote(batch.main)}`, `${removeScript(batch.main, batch.branches, options)} || fail=1`]),
	"[ \"$fail\" -eq 0 ]"
].join("\n");
/** wt's own names for a branch: `^`, `-`, `@`, `pr:N`, `mr:N` or a PR/MR link. */
const isShortcut = (name) => /^([\^@-]|(pr|mr):\d+|https?:\/\/\S+)$/.test(name);
/**
* Switches to the worktree for `name`, creating the branch and worktree when needed,
* and writes wt's JSON answer to `out`. A branch that exists locally or on origin is
* switched to; any other name is created from the base. Shortcuts go to wt unchanged.
*/
const newScript = ({ main, name, base, out }) => {
	const switchTo = (args) => [
		"wt",
		"-C",
		quote(main),
		"switch",
		...args,
		"--no-cd",
		"--format=json",
		">",
		quote(out)
	].join(" ");
	if (isShortcut(name)) return switchTo([quote(name)]);
	const exists = ["heads", "remotes/origin"].map((refs) => `git -C ${quote(main)} show-ref --verify --quiet ${quote(`refs/${refs}/${name}`)}`).join(" || ");
	const create = [
		"--create",
		quote(name),
		...match$5(base, {
			onNone: () => [],
			onSome: (b) => ["--base", quote(b)]
		})
	];
	return `if ${exists}; then\n  ${switchTo([quote(name)])}\nelse\n  ${switchTo(create)}\nfi`;
};
/**
* Runs a job under `sh`. $1: the person's shell; $2: the job's script, run in that shell
* as a login, interactive shell so its own `wt` and environment apply. On success it says
* Done and ends a second later; on failure it shows the exit code and waits for Enter, so
* the job's window stays open to be read. It exits with the job's code.
*/
const JOB_SCRIPT = `"$1" -l -i -c "$2"
rc=$?
if [ "$rc" -eq 0 ]; then
  printf '\\n\\033[32mDone.\\033[0m\\n'
  sleep 1
else
  printf '\\n\\033[31mFailed (exit %s). Press Enter to close.\\033[0m\\n' "$rc"
  read -r _
fi
exit "$rc"`;
/** Prints each folder argument that no longer exists, one per line. */
const GONE_SCRIPT = `for dir in "$@"; do [ -e "$dir" ] || printf '%s\\n' "$dir"; done`;
/**
* `hc` arguments that start `job` as a background terminal, printing its address as
* JSON. A job on another machine starts there (`--on`); this machine's needs no flag.
*/
const jobArgs = ({ cwd, shell, body, on }) => [
	"run",
	"--json",
	"--bg",
	"--no-parent",
	...on === null ? [] : ["--on", on],
	"--cwd",
	cwd,
	"--",
	"sh",
	"-c",
	JOB_SCRIPT,
	SCRIPT_NAME,
	shell,
	body
];
const json = (output) => getSuccess(parseJson(output));
/** The terminal address `hc run --json` printed for a started job. */
const startedAddress = (output) => flatMap$3(json(output), (value) => text(at(value, "address")));
/** `hc wait --json` output read. A job ended by a signal has no exit code: it counts as 1. */
const waitResult = (output) => match$5(filter(json(output), isObject), {
	onNone: () => ({ _tag: "Lost" }),
	onSome: (value) => value.ended === true ? {
		_tag: "Ended",
		code: getOrElse$1(finite(value.exit_code), () => 1)
	} : { _tag: "Running" }
});
/** The worktree `wt switch --format=json` switched to or made. */
const switchedTo = (output) => flatMap$3(json(output), (value) => all$2({
	branch: text(at(value, "branch")),
	path: text(at(value, "path"))
}));

// src/dialog.ts
const LOCAL = "refs/heads/";
const ORIGIN = "refs/remotes/origin/";
/** `git for-each-ref --format=%(refname) refs/heads refs/remotes/origin` output read. */
const parseBranches = (output) => output.split("\n").flatMap((line) => {
	const ref = line.trim();
	if (ref.startsWith(LOCAL)) return [{
		name: ref.slice(11),
		remote: false
	}];
	if (ref.startsWith(ORIGIN) && ref !== `${ORIGIN}HEAD`) return [{
		name: ref.slice(20),
		remote: true
	}];
	return [];
});
/** Every worktree with a branch, then local branches without one, then origin-only ones. */
const candidates = (worktrees, branches) => {
	const open = worktrees.flatMap((w) => match$5(w.branch, {
		onNone: () => [],
		onSome: (branch) => [{
			_tag: "Worktree",
			branch,
			path: w.path
		}]
	}));
	const taken = new Set(open.map(choiceName));
	const local = branches.filter((b) => !b.remote && !taken.has(b.name));
	const localNames = new Set(branches.filter((b) => !b.remote).map((b) => b.name));
	const remote = branches.filter((b) => b.remote && !localNames.has(b.name) && !taken.has(b.name));
	return [...open, ...[...local, ...remote].map((b) => ({
		_tag: "Branch",
		name: b.name,
		remote: b.remote
	}))];
};
/** The dialog's list for the typed text, at most `limit` lines. */
const choicesFor = (typed, worktrees, branches, limit) => {
	const name = typed.trim();
	if (isShortcut(name)) return [{
		_tag: "Typed",
		name,
		shortcut: true
	}];
	const query = name.toLowerCase();
	const matches = ranked(candidates(worktrees, branches), choiceName, query);
	const exact = matches.some((choice) => choiceName(choice).toLowerCase() === query);
	return [...name === "" || exact ? [] : [{
		_tag: "Typed",
		name,
		shortcut: false
	}], ...matches].slice(0, Math.max(0, limit));
};
/**
* The items whose name holds `query` (lower case), best first (see `rank`), keeping their
* order within a rank.
*/
const ranked = (items, nameOf, query) => items.flatMap((item, order) => match$5(rank(nameOf(item), query), {
	onNone: () => [],
	onSome: (score) => [{
		item,
		score,
		order
	}]
})).sort((a, b) => a.score - b.score || a.order - b.order).map(({ item }) => item);
/** 0 for an exact match, 1 for a prefix, 2 anywhere in the name; none when it doesn't match. */
const rank = (name, query) => {
	const lower = name.toLowerCase();
	if (lower === query) return some(0);
	if (lower.startsWith(query)) return some(1);
	return lower.includes(query) ? some(2) : none();
};
/** The branch name a choice hands to `wt switch`. */
const choiceName = (choice) => choice._tag === "Worktree" ? choice.branch : choice.name;
/**
* What Enter asks the panel to run: switch to or create the choice's branch in the repo
* `repo`. `current` is the branch I'm on; with none, the default branch is the base.
*/
const enterAction = (repo, choice, base, current) => ({
	_tag: "Create",
	machine: repo.machine,
	main: repo.root,
	name: choiceName(choice),
	base: base === "current" ? getOrNull(current) : null
});
/** The repos whose main checkout's folder name matches the typed text, best first. */
const reposFor = (typed, repos) => ranked(repos, (repo) => lastSegment(repo.root), typed.trim().toLowerCase());
/** The dialog as it opens with `props`: reading its repo, unless it must ask for one. */
const openDialog = (props) => ({
	mode: props.mode,
	repo: props.repo,
	current: props.branch,
	repos: props.repos,
	worktrees: [],
	branches: [],
	reading: isSome(props.repo),
	error: none(),
	base: "default",
	at: 0
});
/** The most lines the dialog lists. */
const LINE_LIMIT = 50;
/** The worktrees whose branch matches the typed text, best first, at most `limit`. */
const worktreesFor = (typed, worktrees, limit) => ranked(candidates(worktrees, []), choiceName, typed.trim().toLowerCase()).slice(0, Math.max(0, limit));
/**
* The dialog's lines for the typed text: repos while it asks for one, else choices: the
* repo's worktrees when picking one to open, else worktrees and branches to switch to or
* create.
*/
const linesFor = (state, typed) => match$5(state.repo, {
	onNone: () => reposFor(typed, state.repos).map((repo) => ({
		_tag: "Repo",
		repo
	})),
	onSome: () => state.mode === "open" ? worktreesFor(typed, state.worktrees, 50) : choicesFor(typed, state.worktrees, state.branches, 50)
});
/**
* The dialog once its repo is read: the worktrees and branches, each read's failure
* shown, the other still offered.
*/
const withRead = (state, list, branches) => ({
	...state,
	worktrees: getOrElse(list, () => []),
	branches: getOrElse(branches, () => []),
	reading: false,
	error: liftPredicate([getFailure(list), getFailure(branches)].flatMap(toArray).join(" · "), (reasons) => reasons !== "")
});
/** The highlighted line's place among `lines`: never past the last one. */
const highlight = (state, lines) => Math.min(state.at, Math.max(0, lines.length - 1));
/** The highlight moved one line down (`1`) or up (`-1`), wrapping round the list. */
const moved = (state, lines, step) => {
	const count = Math.max(1, lines.length);
	return {
		...state,
		at: (highlight(state, lines) + step + count) % count
	};
};
/** What was typed changed: the highlight goes back to the first line. */
const retyped = (state) => ({
	...state,
	at: 0
});
/** Tab: the other base, when there is a branch I'm on to offer. */
const flippedBase = (state) => ({
	...state,
	base: state.base === "default" && isSome(state.current) ? "current" : "default"
});
/** Enter or a click on `line`: picks the repo, or asks the panel to switch or create. */
const pick = (state, line) => {
	if (isNone(line)) return { _tag: "Nothing" };
	const taken = line.value;
	if (taken._tag === "Repo") return {
		_tag: "ReadRepo",
		repo: taken.repo,
		state: {
			...state,
			repo: some(taken.repo),
			current: none(),
			reading: true,
			at: 0
		}
	};
	return match$5(state.repo, {
		onNone: () => ({ _tag: "Nothing" }),
		onSome: (repo) => ({
			_tag: "Send",
			action: state.mode === "open" && taken._tag === "Worktree" ? {
				_tag: "GoTo",
				machine: repo.machine,
				folder: taken.path,
				name: taken.branch
			} : enterAction(repo, taken, state.base, state.current)
		})
	});
};
/** The dialog's title: what it is for, and the repo and machine it works in. */
const dialogTitle = (state) => {
	const what = state.mode === "open" ? "Open a worktree" : "New or open worktree";
	const where = state.mode === "open" ? "of" : "in";
	return match$5(state.repo, {
		onNone: () => `${what}: pick a repo`,
		onSome: ({ machine, root }) => `${what} ${where} ${lastSegment(root)}${machine === null ? "" : ` on ${machine}`}`
	});
};
/** What the dialog says at its step: see `DialogCopy`. */
const dialogCopy = (state) => ({
	placeholder: isNone(state.repo) ? "Repo name" : state.mode === "open" ? "Worktree's branch" : "Branch name, pr:123 or a PR link",
	empty: isNone(state.repo) ? "No repo matches." : state.reading ? "Reading worktrees and branches…" : state.mode === "open" ? "No worktree matches." : "Type a branch name to create it.",
	footer: isNone(state.repo) ? "↑↓ choose · Enter picks the repo · Esc closes" : state.mode === "open" ? "↑↓ choose · Enter goes to its space, or opens one · Esc closes" : "↑↓ choose · Enter opens or creates it · Tab switches the base · Esc closes",
	offersBase: isSome(state.repo) && state.mode === "new",
	worktreeHint: (path) => state.mode === "open" ? lastSegment(path) : "open worktree"
});
/** The hint beside a repo the dialog offers: where it is, and on which machine. */
const repoHint = ({ machine, root }, home) => locatedLabel({
	machine,
	folder: root
}, { home });

// src/keys.ts
const IGNORE = { _tag: "Ignore" };
const PANEL_COMMANDS = [
	"refresh",
	"new",
	"settings",
	"focus"
];
const isPanelCommand = (command) => PANEL_COMMANDS.includes(command);
/**
* What the copy playing `role` does with `command`. Herdr hands a command to every shown
* copy, and a hidden one gets nothing, so exactly one copy acts:
* - `toggle`: the toggle copy while it shows (it stays shown when the panel hides, so it
*   can show it again); with no toggle copy shown, the panel, which can only hide itself.
* - the panel's own commands, and unknown ones: the panel while it shows; while it is
*   hidden, the toggle copy shows it and hands the command on.
* - overlays never act on one.
*/
const routeCommand = (command, role, copies) => {
	if (role !== "panel" && role !== "toggle") return IGNORE;
	if (command === "toggle") {
		if (role === "panel" && copies.toggleShown) return IGNORE;
		return match$5(copies.panel, {
			onNone: () => role === "toggle" ? { _tag: "NoPanel" } : IGNORE,
			onSome: (block) => ({
				_tag: "Toggle",
				id: block.id
			})
		});
	}
	if (role === "panel") return isPanelCommand(command) ? {
		_tag: "Run",
		command
	} : {
		_tag: "Unknown",
		command
	};
	return match$5(copies.panel, {
		onNone: () => ({ _tag: "NoPanel" }),
		onSome: (block) => !block.hidden ? IGNORE : isPanelCommand(command) ? {
			_tag: "ShowThen",
			id: block.id,
			command
		} : {
			_tag: "Unknown",
			command
		}
	});
};
const COMMAND_ACTIONS = {
	refresh: { _tag: "Refresh" },
	settings: { _tag: "Settings" },
	new: {
		_tag: "NewOrOpen",
		folder: null
	},
	focus: { _tag: "Focus" }
};
/** The mailbox action the panel runs for a command. */
const actionFor = (command) => COMMAND_ACTIONS[command];
/** The copies commands care about, from Herdr's shown layout (`layout()`). */
const copiesIn = (layout, mod) => ({
	panel: findModBlock(layout, mod),
	toggleShown: exists(findRoleBlock(layout, mod, TOGGLE_ROLE), (block) => !block.hidden)
});
/**
* How long a mailbox request stays fresh, in ms. A panel that starts runs a fresh one (the
* toggle copy just showed it to hand on a command) and skips an older one, left over
* from an earlier run.
*/
const FRESH_FOR = 5e3;
/** A request posted at `sent` (ms, its id's whole part) is stale at `now`. */
const isLeftover = (sent, now) => now - sent > FRESH_FOR;
/** The mailbox request a panel that starts counts as handled already. */
const handledAtStart = (request, now) => filter(map$3(request, ({ id }) => id), (id) => isLeftover(id, now));
/** The warning a step shows; none for a step that acts. */
const noticeFor = (step) => {
	switch (step._tag) {
		case "NoPanel": return some({
			title: "No worktrunk panel here",
			body: "This layout has no worktrunk panel block to show."
		});
		case "Unknown": return some({
			title: "Unknown worktrunk command",
			body: `"${step.command}": use refresh, new, settings, focus or toggle.`
		});
		default: return none();
	}
};

// src/menus.ts
/** How many worktrees `batches` remove. */
const removedBy = (batches) => batches.reduce((n, batch) => n + batch.paths.length, 0);
/** How many worktrees a clean up removes. */
const cleanupCount = (action) => removedBy(action.batches);
const item = (label, action, danger = false) => ({
	label,
	danger,
	checked: false,
	action
});
/** "Reveal in Finder" for a folder on `machine`: only this machine's Finder can show it. */
const revealOn = (machine, path) => machine === null ? [item("Reveal in Finder", {
	_tag: "Reveal",
	path
})] : [];
const mergeOf = ({ machine, root }, worktree, branch, mode) => ({
	_tag: "Merge",
	target: {
		machine,
		main: root,
		path: worktree.path,
		branch
	},
	mode,
	dirty: worktree.dirty
});
/** Removing a linked worktree: by its branch, or by its folder when it has none. */
const removeOf = ({ machine, root }, worktree) => ({
	_tag: "Remove",
	target: {
		machine,
		main: root,
		path: worktree.path,
		branch: getOrElse$1(worktree.branch, () => worktree.path)
	},
	dirty: worktree.dirty
});
/** The right-click menu of a worktree of `repo`. */
const rowMenu = (repo, worktree, click) => {
	const remove = item("Remove…", removeOf(repo, worktree), true);
	const linked = worktree.state._tag === "Main" ? [] : match$5(worktree.branch, {
		onNone: () => [remove],
		onSome: (branch) => [
			item("Merge into main (squash)", mergeOf(repo, worktree, branch, "squash")),
			item("Merge, keeping every commit", mergeOf(repo, worktree, branch, "keep")),
			remove
		]
	});
	return [
		item("Open", {
			_tag: "Open",
			click
		}),
		...linked,
		item("Copy path", {
			_tag: "CopyPath",
			path: worktree.path
		}),
		...revealOn(repo.machine, worktree.path)
	];
};
/**
* Merging (squashed) or removing the worktree of `repo` that holds `folder` (on the
* repo's machine), as a space's menu asks: the deepest of `worktrees` containing it.
* Fails, saying why, for the main checkout, a detached worktree's merge, or a folder in
* none of them.
*/
const spaceWorktreeAction = (act, repo, worktrees, folder) => {
	const root = repo.root;
	const holder = worktrees.filter((w) => isUnder(folder, w.path)).reduce((best, w) => best && best.path.length >= w.path.length ? best : w, void 0);
	if (holder === void 0) return fail$2(`${folder} isn't in a worktree of ${lastSegment(root)}.`);
	if (holder.state._tag === "Main") return fail$2(`${lastSegment(root)}'s main checkout can't be merged or removed.`);
	if (act === "Remove") return succeed$3(removeOf(repo, holder));
	return match$5(holder.branch, {
		onNone: () => fail$2(`${lastSegment(holder.path)} has no branch to merge.`),
		onSome: (branch) => succeed$3(mergeOf(repo, holder, branch, "squash"))
	});
};
/** One menu row's height, in px. */
const ITEM_HEIGHT = 30;
/** The menu's title line plus its padding, in px. */
const MENU_CHROME = 40;
/** A menu's height for `items` rows. */
const menuHeight = (items) => 40 + items * 30;
/** Removing every merged worktree of `repos`, batched by repo; none when there are none. */
const cleanupAction = (repos) => {
	const found = repos.flatMap(({ machine, root, worktrees }) => {
		const merged = worktrees.filter((w) => w.state._tag === "Merged");
		return merged.length === 0 ? [] : [{
			machine,
			root,
			merged
		}];
	});
	if (found.length === 0) return none();
	const all = found.flatMap(({ merged }) => merged);
	return some({
		_tag: "Cleanup",
		batches: found.map(({ machine, root, merged }) => ({
			machine,
			main: root,
			branches: merged.map((w) => getOrElse$1(w.branch, () => w.path)),
			paths: merged.map((w) => w.path)
		})),
		dirty: all.filter((w) => w.dirty).length
	});
};
/** The right-click menu of `repo`. */
const repoMenu = ({ machine, root }, worktrees) => [
	item("New or open worktree…", {
		_tag: "NewOrOpenAt",
		at: {
			machine,
			folder: root
		}
	}),
	...toArray(cleanupAction([{
		machine,
		root,
		worktrees
	}])).map((action) => item(`Clean up ${cleanupCount(action)} merged…`, action, true)),
	item("Refresh", { _tag: "Refresh" }),
	...revealOn(machine, root),
	item("Hide this repo", {
		_tag: "Hide",
		machine,
		root
	})
];
/**
* The worktree a row's key names (its machine and path, as `repoKey` keys a folder) in
* any list of a repo on that machine (`lists`, by `repoKey`).
*/
const findWorktree = (lists, key) => {
	const { machine, root: path } = repoOfKey(key);
	return fromNullishOr(Array.from(lists).map(([listKey, list]) => ({
		repo: repoOfKey(listKey),
		list
	})).filter(({ repo }) => repo.machine === machine).flatMap(({ repo, list }) => list.worktrees.filter((w) => w.path === path).map((worktree) => ({
		...repo,
		worktree
	})))[0]);
};
/**
* Removing the merged worktrees among those the row `keys` name (see `findWorktree`),
* batched by repo (machine and folder) in the order their repos first appear; none when
* none of them is merged.
*/
const cleanupFor = (lists, keys) => {
	const found = keys.flatMap((key) => toArray(findWorktree(lists, key)));
	const repos = Array.from(new Map(found.map((f) => [repoKey(f), {
		machine: f.machine,
		root: f.root
	}])));
	return cleanupAction(repos.map(([key, repo]) => ({
		...repo,
		worktrees: found.filter((f) => repoKey(f) === key).map((f) => f.worktree)
	})));
};
const DIRTY_LINE = "It has uncommitted changes: wt stops rather than lose them.";
const SPACES_LINE = "Spaces open on a removed worktree close.";
/** What to ask before `action`; none for actions that remove or merge nothing. */
const confirmFor = (action) => {
	switch (action._tag) {
		case "Merge": return some({
			title: `Merge ${action.target.branch} into main?`,
			lines: [
				action.mode === "squash" ? "Its commits become one commit on main." : "Every commit is kept, rebased onto main.",
				"Then the worktree is removed, and its branch with it.",
				...action.dirty ? ["Its uncommitted changes are committed first."] : [],
				SPACES_LINE
			],
			go: "Merge",
			danger: false
		});
		case "Remove": return some({
			title: `Remove ${action.target.branch === action.target.path ? lastSegment(action.target.path) : action.target.branch}?`,
			lines: [
				"The worktree's folder is removed; its branch too, if it is merged.",
				...action.dirty ? [DIRTY_LINE] : [],
				SPACES_LINE
			],
			go: "Remove",
			danger: true
		});
		case "Cleanup": {
			const count = cleanupCount(action);
			return some({
				title: `Remove ${count} merged worktree${count === 1 ? "" : "s"}?`,
				lines: [
					...action.batches.map((b) => `${lastSegment(b.main)}: ${b.branches.join(", ")}`),
					...action.dirty > 0 ? [`${action.dirty} with uncommitted changes: wt stops rather than lose them.`] : [],
					SPACES_LINE
				],
				go: "Remove",
				danger: true
			});
		}
		default: return none();
	}
};
/** The confirm dialog's height for `lines` lines of text, in px, never taller than 560. */
const dialogHeight = (lines) => Math.min(560, 132 + lines * 22);
/** The clean up of `batches`, all on `machine`, as one job; none for no batches. */
const cleanupJob = (batches, machine, title, options) => toArray(map$3(fromNullishOr(batches[0]), (first) => ({
	title,
	cwd: first.main,
	body: cleanupScript(batches, options),
	gone: batches.flatMap((batch) => batch.paths),
	on: machine
})));
/**
* The jobs for `action`, in the order they run; none for actions that aren't jobs
* (Create is built with its temp file). Each job runs on its repo's machine. A job runs
* on one machine, so a clean up is one job per machine its repos are on, in the order the
* machines first appear, each named after its machine when there are several.
*/
const jobsFor = (action, options) => {
	switch (action._tag) {
		case "Merge": return [{
			title: `Merge ${action.target.branch} into main`,
			cwd: action.target.main,
			body: mergeScript(action.target, action.mode, options),
			gone: [action.target.path],
			on: action.target.machine
		}];
		case "Remove": return [{
			title: `Remove ${action.target.branch}`,
			cwd: action.target.main,
			body: removeScript(action.target.main, [action.target.branch], options),
			gone: [action.target.path],
			on: action.target.machine
		}];
		case "Cleanup": {
			const machines = Array.from(new Set(action.batches.map((batch) => batch.machine)));
			return machines.flatMap((machine) => {
				const batches = action.batches.filter((batch) => batch.machine === machine);
				const where = machines.length > 1 ? ` on ${machineName(machine)}` : "";
				return cleanupJob(batches, machine, `Clean up ${removedBy(batches)} merged${where}`, options);
			});
		}
		default: return [];
	}
};
/** What to say when a job is asked for while `running` (its title) still runs. */
const busyNotice = (running) => ({
	title: "worktrunk is busy",
	body: `Wait for "${running}" to finish.`
});
/** The step for `act` on the space `space`, from where every space is now (`places`). */
const spaceStep = (places, space, act) => match$5(fromNullishOr(places.find((p) => p.space.id === space)), {
	onNone: () => ({ _tag: "NoFolder" }),
	onSome: ({ machine, place }) => {
		const at = {
			machine,
			folder: place
		};
		switch (act) {
			case "NewOrOpen": return {
				_tag: "Dialog",
				mode: "new",
				at
			};
			case "Open": return {
				_tag: "Dialog",
				mode: "open",
				at
			};
			default: return {
				_tag: "Act",
				act,
				at
			};
		}
	}
});
/** The machine filter's menu: All machines, then each machine, the current one checked. */
const machineMenu = (choices) => choices.map((choice) => ({
	...item(isNone(choice.machine) ? "All machines" : choice.label, {
		_tag: "PickMachine",
		machine: match$5(choice.machine, {
			onNone: () => null,
			onSome: (name) => ({ name })
		})
	}),
	checked: choice.selected
}));
/** The group filter's menu: All groups, then each group, the current one checked. */
const groupMenu = (chips) => chips.map((chip) => ({
	...item(isNone(chip.group) ? "All groups" : chip.label, {
		_tag: "PickGroup",
		group: getOrNull(chip.group)
	}),
	checked: chip.selected
}));
/**
* A filter dropdown's button text: its menu's checked item, else the first (a saved group
* the first scan hasn't found yet is in no item).
*/
const filterButton = (items) => (items.find((i) => i.checked) ?? items[0])?.label ?? "";

// src/reads.ts
/** A repo's list after a read: the new worktrees, or the old ones with the read's error. */
const foldList = (old, read) => match$4(read, {
	onSuccess: (worktrees) => ({
		_tag: "Read",
		worktrees,
		error: none()
	}),
	onFailure: (error) => ({
		_tag: "Read",
		worktrees: match$5(old, {
			onNone: () => [],
			onSome: (list) => list.worktrees
		}),
		error: some(error)
	})
});
/** What the panel keeps after `machine`'s batched list read answers. */
const keepLists = (kept, machine, answer) => match$4(answer, {
	onFailure: (status) => ({
		...kept,
		machines: new Map([...kept.machines, [machine, status]])
	}),
	onSuccess: (read) => ({
		...kept,
		lists: new Map([...kept.lists, ...Array.from(read, ([key, list]) => [key, foldList(fromNullishOr(kept.lists.get(key)), list)])])
	})
});
/** A repo's CI after a CI read: each worktree's CI by path, or the old CI with the error. */
const foldCi = (old, read) => match$4(read, {
	onSuccess: (worktrees) => ({
		byPath: new Map(worktrees.map((w) => [w.path, w.ci])),
		error: none()
	}),
	onFailure: (error) => ({
		byPath: match$5(old, {
			onNone: () => /* @__PURE__ */ new Map(),
			onSome: (ci) => ci.byPath
		}),
		error: some(error)
	})
});
/**
* Whether the group folders are scanned again: always the first time, when `forced`,
* when the settings change what to scan (`key`), and once the last scan is older than
* `every` ms.
*/
const scanDue = (last, now) => match$5(last, {
	onNone: () => true,
	onSome: (scan) => now.forced || now.key !== scan.key || now.now - scan.at > now.every
});
/**
* Whether a refresh reads CI too: when there is no last CI read (`last`, when it started,
* in ms; none before the first, or once something asks for fresh CI), and once the last
* is older than `every` ms.
*/
const ciDue = (last, { now, every }) => match$5(last, {
	onNone: () => true,
	onSome: (at) => now - at > every
});
const IDLE = { _tag: "Idle" };
/**
* Asking for a refresh: an idle panel starts it; a loading one keeps a single refresh to
* run after, which scans if any ask did.
*/
const askRefresh = (loader, ask) => loader._tag === "Idle" ? {
	loader: {
		_tag: "Loading",
		again: none()
	},
	start: some(ask)
} : {
	loader: {
		_tag: "Loading",
		again: some({ scan: ask.scan || exists(loader.again, (again) => again.scan) })
	},
	start: none()
};
/** A refresh finished: idle again, with the refresh asked for meanwhile, if any. */
const refreshDone = (loader) => ({
	loader: IDLE,
	again: loader._tag === "Loading" ? loader.again : none()
});
const NO_READS = {
	started: false,
	wasHidden: false,
	group: ""
};
/**
* What a render starts: `Start` reads everything when the panel first shows, or shows
* again after being hidden; `NewGroup` reads the repos of a newly picked group chip, CI
* included; `None` otherwise. Nothing is read while hidden.
*/
const onRender = (reads, now) => {
	const wasHidden = !now.shown;
	if (now.shown && (!reads.started || reads.wasHidden)) return {
		reads: {
			started: true,
			wasHidden,
			group: now.group
		},
		step: "Start"
	};
	if (now.shown && now.group !== reads.group) return {
		reads: {
			...reads,
			wasHidden,
			group: now.group
		},
		step: "NewGroup"
	};
	return {
		reads: {
			...reads,
			wasHidden
		},
		step: "None"
	};
};
/**
* The Current repo from its lookup: the listed repo (same machine and folder), or one the
* panel doesn't list (a hidden one, say), grouped by the group folders.
*/
const currentRepoOf = (found, repos, folders, homes) => match$5(found, {
	onNone: () => ({ _tag: "Looking" }),
	onSome: match$4({
		onFailure: (reason) => ({
			_tag: "Failed",
			reason
		}),
		onSuccess: match$5({
			onNone: () => ({ _tag: "NotInRepo" }),
			onSome: (repo) => ({
				_tag: "InRepo",
				repo: repos.find((listed) => repoKey(listed) === repoKey(repo)) ?? {
					...repo,
					group: groupOf(repo, folders, homes)
				}
			})
		})
	})
});
const NOT_FOLLOWING = {
	folder: none(),
	found: none()
};
/**
* What a render looks up: while the Current view shows (`following`), the focused
* folder, when it isn't the one last looked up (the same path on another machine is
* another folder). Herdr renders on every focus change, so this never polls.
*/
const followFocus = (follow, { following, folder }) => !following ? {
	follow: {
		...follow,
		folder: none()
	},
	lookUp: none()
} : contains(follow.folder, folder) ? {
	follow,
	lookUp: none()
} : {
	follow: {
		...follow,
		folder: some(folder)
	},
	lookUp: some(folder)
};
/**
* A lookup the machine's Herdr refused to start: every exec slot was taken. It answers
* nothing about the folder.
*/
const BUSY = { _tag: "Busy" };
/**
* A lookup's answer for `folder`: kept, unless the focus moved on since (an answer for
* an older focus is dropped). `refresh` when it names another repo than before, or is
* the first answer, so the lists read the new Current repo. A `BUSY` lookup keeps the
* last answer and forgets the folder, so the next render looks it up again.
*/
const takeLookup = (follow, folder, answer) => !contains(follow.folder, folder) ? {
	follow,
	refresh: false
} : answer._tag === "Busy" ? {
	follow: {
		...follow,
		folder: none()
	},
	refresh: false
} : {
	follow: {
		...follow,
		found: some(answer)
	},
	refresh: match$5(follow.found, {
		onNone: () => true,
		onSome: (before) => keyOf(before) !== keyOf(answer)
	})
};
/** The `repoKey` of the repo an answer names; undefined for none or a failed lookup. */
const keyOf = (answer) => match$4(answer, {
	onFailure: () => void 0,
	onSuccess: (found) => getOrUndefined$1(map$3(found, repoKey))
});

// src/sync.ts
const parseRecord$1 = (raw) => flatMap$3(getSuccess(parseJson(raw)), (json) => all$2({
	layout: text(at(json, "layout")),
	version: text(at(json, "version"))
}));
/**
* The toast to show when the installed Herdr (`installed`) differs from the version the
* sync record (`record`, the file's text) was built from. `told` is the installed version
* the panel last showed this toast for, so it shows once per version. None when there is
* no readable record, the versions match, or the installed version is unknown.
*/
const syncNotice = (record, installed, told) => record.pipe(flatMap$3(parseRecord$1), filter((built) => installed !== "" && built.version !== installed), filter(() => told !== installed), map$3((built) => ({
	title: "Herdr updated: run herdr:sync",
	body: `Your "${built.layout}" layout was built from Herdr ${built.version}; Herdr is now ${installed}. Run \`vp run herdr:sync\` in herdr-mods.`
})));

// src/worktrees.ts
const CHANGE_KINDS = [
	"staged",
	"modified",
	"untracked",
	"renamed",
	"deleted",
	"conflicted"
];
const count = (item, ...path) => getOrElse$1(finite(at(item, ...path)), () => 0);
const dirtyOf = (item) => CHANGE_KINDS.some((kind) => at(item, "worktree", "changes", kind) === true);
const isMain = (item) => at(item, "worktree", "main") === true;
const headOf = (item) => text(at(item, "head", "sha"));
/**
* New: no commits or changes of its own, and at main's tip or at the main checkout's commit.
* wt compares with the remote's main, so a worktree made from a main checkout that hasn't
* pulled reads as integrated "ancestor" although nothing was done in it.
*/
const isNew = (item, mainHead) => {
	if (dirtyOf(item) || count(item, "default_branch", "ahead") !== 0) return false;
	const atTip = at(item, "display", "state") === "empty" && contains(text(at(item, "default_branch", "integration", "reason")), "same_commit");
	const head = headOf(item);
	const atMainCheckout = isSome(head) && contains(mainHead, head.value);
	return atTip || atMainCheckout;
};
const stateOf = (item, mainHead) => {
	if (isMain(item)) return { _tag: "Main" };
	if (isNew(item, mainHead)) return { _tag: "New" };
	const state = at(item, "display", "state");
	const reason = text(at(item, "default_branch", "integration", "reason"));
	if (state === "integrated" || state === "empty") return {
		_tag: "Merged",
		reason
	};
	if (state === "would_conflict") return { _tag: "Conflict" };
	return { _tag: "Active" };
};
const committedAt = (item) => text(at(item, "head", "committed_at")).pipe(map$3(Date.parse), filter((ms) => !Number.isNaN(ms)));
const CI_STATUSES = [
	"passed",
	"running",
	"failed"
];
const isCiStatus = (value) => CI_STATUSES.includes(value);
const ciOf$1 = (item, asked) => {
	if (!asked) return { _tag: "NotAsked" };
	const checks = at(item, "checks");
	const status = at(checks, "status");
	if (isCiStatus(status)) return {
		_tag: "Checks",
		status,
		stale: at(checks, "stale") === true
	};
	if (at(item, "pr", "mergeable") === false) return { _tag: "Conflicts" };
	if (checks === void 0 && at(item, "pr") !== null) return { _tag: "None" };
	return { _tag: "Unknown" };
};
const toWorktree = (item, asked, mainHead) => map$3(text(at(item, "worktree", "path")), (path) => {
	const upstream = at(item, "upstream");
	return {
		branch: text(at(item, "branch")),
		path,
		state: stateOf(item, mainHead),
		ahead: count(item, "default_branch", "ahead"),
		behind: count(item, "default_branch", "behind"),
		added: count(item, "default_branch", "diff", "added"),
		deleted: count(item, "default_branch", "diff", "deleted"),
		upstream: isObject(upstream) ? some({
			ahead: count(upstream, "ahead"),
			behind: count(upstream, "behind")
		}) : none(),
		dirty: dirtyOf(item),
		ci: ciOf$1(item, asked),
		committedAt: committedAt(item)
	};
});
const itemsOf = (list) => {
	const items = Array.isArray(list) ? list : at(list, "items");
	return Array.isArray(items) ? succeed$3(items) : fail$2("wt list printed no list of worktrees");
};
/** The worktrees in `wt list --format=json` output, in wt's order, or why it didn't parse. */
const parseList = (output) => parseJson(output).pipe(flatMap$2((list) => map$2(itemsOf(list), (items) => {
	const asked = at(list, "collected", "ci") === true;
	const mainHead = flatMap$3(fromNullishOr(items.find(isMain)), headOf);
	return items.flatMap((item) => toArray(toWorktree(item, asked, mainHead)));
})));
/** The last line of `text` that has anything on it; empty when none does. */
const lastLine = (text) => text.trim().split("\n").filter(Boolean).at(-1) ?? "";
/** Starts each repo's record in the batched read's output (ASCII record separator). */
const RECORD_START = "";
/** One record: `<exit code><TAB><folder>`, then on the next lines what `wt list` printed. */
const parseRecord = (record) => {
	const newline = record.indexOf("\n");
	const head = newline < 0 ? record : record.slice(0, newline);
	const body = newline < 0 ? "" : record.slice(newline + 1);
	const tab = head.indexOf("	");
	if (tab < 0) return [];
	const code = head.slice(0, tab);
	return [[head.slice(tab + 1), code === "0" ? parseList(body) : fail$2(lastLine(body) || `wt list failed (exit ${code})`)]];
};
/**
* Each repo's `wt list` from the batched read's output, by its folder: its worktrees, or
* the failed read's last error line.
*/
const parseLists = (stdout, roots) => {
	const read = new Map(stdout.split("").flatMap(parseRecord));
	const unanswered = fail$2("wt list gave no answer for it");
	return new Map(roots.map((root) => [root, read.get(root) ?? unanswered]));
};

// src/shell.ts
/** The promise rejected: the program couldn't start (not installed, no such folder). */
var ShellError = class extends TaggedError("ShellError") {};
/** `wt list` printed something that isn't its JSON list of worktrees. */
var ListUnreadable = class extends TaggedError("ListUnreadable") {};
/** The program ran and exited non-zero. `command` names it in messages. */
var CommandFailed = class extends TaggedError("CommandFailed") {};
var Shell = class Shell extends Service()("iangregsondev-worktrunk/Shell") {
	static layer = (api) => {
		const use = (fn) => tryPromise({
			try: () => fn(api),
			catch: (cause) => new ShellError({ cause })
		});
		const exec = fn("Shell.exec")(function* (command, args, options) {
			const run = yield* use((herdr) => herdr.exec(command, [...args], options));
			if (run.code !== 0) return yield* new CommandFailed({
				command,
				code: run.code,
				stderr: run.stderr
			});
			return run;
		});
		const hc = (args) => use((herdr) => herdr.hc([...args]));
		return succeed$1(Shell, Shell.of({
			use,
			exec,
			hc
		}));
	};
};
/** The longest a script may run, in ms. */
const SCRIPT_TIMEOUT = 6e4;
/** `options` with `on` set for a machine other than this one; this machine's runs leave it out. */
const onMachine = (on, options) => on === void 0 || on === null ? options : {
	...options,
	on
};
/**
* Runs `body` under `sh` with `args` as $1..., on the machine and for up to the time
* `options` give; a failure names the run `label`.
*/
const runScript = fn("runScript")(function* (label, body, args, options = {}) {
	const shell = yield* Shell;
	const timeout = options.timeout ?? SCRIPT_TIMEOUT;
	return yield* shell.exec("sh", shArgs(body, args), onMachine(options.on, { timeout })).pipe(catchTag("CommandFailed", (failed) => fail(new CommandFailed({
		command: label,
		code: failed.code,
		stderr: failed.stderr
	}))));
});
/** The worktrees `body` prints for `repo`, run on its machine, the run named `label`. */
const worktreesFrom = fnUntraced(function* (label, body, repo, timeout) {
	const run = yield* runScript(label, body, [repo.root], {
		on: repo.machine,
		timeout
	});
	return yield* fromResult(parseList(run.stdout)).pipe(mapError((message) => new ListUnreadable({ message })));
});
/** The worktrees of `repo`, from `wt list --format=json` on its machine. */
const wtList = fn("wtList")(function* (repo) {
	return yield* worktreesFrom("wt list", LIST_SCRIPT, repo);
});
/** The batched list reads a machine's repos a few at a time, so it gets longer than one script. */
const LISTS_TIMEOUT = 18e4;
/**
* The worktrees of every repo in `roots` on `machine`, from one batched `wt list` run
* there, by folder: each repo's list, or its read's one-line reason.
*/
const wtLists = fn("wtLists")(function* (machine, roots) {
	const run = yield* runScript("wt list", LISTS_SCRIPT, roots, {
		on: machine,
		timeout: LISTS_TIMEOUT
	});
	return parseLists(run.stdout, roots);
});
/** `--full` asks the forge for every branch's checks: slow when cold or rate limited. */
const CI_TIMEOUT = 24e4;
/** The worktrees of `repo` with their CI, from `wt list --full` on its machine. */
const wtCi = fn("wtCi")(function* (repo) {
	return yield* worktreesFrom("wt list --full", CI_SCRIPT, repo, CI_TIMEOUT);
});
/**
* The repos the folder scan finds in the settings' group folders on `machine` (its home
* in `homes`), and those that don't exist.
*/
const scanRepos = fn("scanRepos")(function* (settings, machine, homes) {
	const args = scanArgs(settings, machine, homes);
	if (args.length <= 2) return {
		repos: [],
		missing: []
	};
	const run = yield* runScript("the folder scan", SCAN_SCRIPT, args, { on: machine });
	return {
		repos: parseScan(run.stdout, machine),
		missing: missingFolders(run.stdout)
	};
});
/** The home folder of `machine`, read there; an empty $HOME fails, since `~` can't mean it. */
const machineHome = fn("machineHome")(function* (machine) {
	const home = (yield* (yield* Shell).exec("sh", ["-c", "printf %s \"$HOME\""], onMachine(machine, {}))).stdout.trim();
	if (home === "") return yield* new CommandFailed({
		command: "the home folder's lookup",
		code: 0,
		stderr: "$HOME is empty"
	});
	return home;
});
/** The repos the given folders on `machine` are in (each once); none for no folders. */
const reposOf = fn("reposOf")(function* (folders, machine = null) {
	if (folders.length === 0) return [];
	const run = yield* runScript("the open spaces' repos", OWNERS_SCRIPT, folders, { on: machine });
	return parseOwners(run.stdout, machine);
});
/**
* The repo the folder `folder` on `machine` is in (the Current repo of the focused
* folder), looked up there through its shared git folder, so a linked worktree names its
* repo; none outside every repo.
*/
const repoAt = fn("repoAt")(function* (folder, machine = null) {
	if (folder === "") return none();
	const run = yield* runScript("the Current repo's lookup", OWNERS_SCRIPT, [folder], { on: machine });
	return currentRepo(run.stdout, machine);
});
/** The local and origin branches of `repo`, read on its machine, for the New-or-open dialog. */
const gitBranches = fn("gitBranches")(function* (repo) {
	const run = yield* runScript("the branch list", BRANCHES_SCRIPT, [repo.root], { on: repo.machine });
	return parseBranches(run.stdout);
});
/** The branch the folder `folder` on `machine` is on, read there; none when its HEAD is detached. */
const branchAt = fn("branchAt")(function* (folder, machine = null) {
	const run = yield* runScript("the branch lookup", BRANCH_SCRIPT, [folder], { on: machine });
	return liftPredicate(run.stdout.trim(), (branch) => branch !== "");
});
/** What the panel says about a failed run: one line. */
const failureText = (error) => {
	switch (error._tag) {
		case "CommandFailed": return lastLine(error.stderr) || `${error.command} failed (exit ${error.code})`;
		case "ShellError": return `couldn't start: ${causeText(error.cause)}`;
		case "ListUnreadable": return error.message;
	}
};
/**
* The machine's Herdr refused to start the run because all its exec slots are taken. The
* machine is up and busy, and a later run gets a slot once one frees.
*/
const slotsFull = (error) => error._tag === "ShellError" && causeText(error.cause).includes("execs are running already");
/** A rejection's reason as text. */
const causeText = (cause) => cause instanceof Error ? cause.message : String(cause);
/**
* The person's login shell couldn't be found, so a job would run with the wrong PATH.
* `reason` says why.
*/
var LoginShellUnknown = class extends TaggedError("LoginShellUnknown") {};
/** The options that run a command on `machine`: none for this machine. */
const runOn = (machine) => machine === null ? void 0 : { on: machine };
/**
* The person's login shell on `machine`, from `$SHELL` there. A read that fails is
* `LoginShellUnknown`: another shell would run the job with another PATH.
*/
const loginShell = fn("loginShell")(function* (machine = null) {
	const found = (yield* (yield* Shell).exec("sh", ["-c", "printf %s \"$SHELL\""], runOn(machine)).pipe(mapError((failed) => new LoginShellUnknown({ reason: `couldn't read $SHELL: ${failureText(failed)}` })))).stdout.trim();
	if (found === "") return yield* new LoginShellUnknown({ reason: "$SHELL is empty" });
	return found;
});
/** `hc run` printed no terminal address: the job never started. `reason` says why. */
var JobNotStarted = class extends TaggedError("JobNotStarted") {};
/** Starts `job` as a background terminal; its address, for waiting on and stopping it. */
const startJob = fn("startJob")(function* (job) {
	const run = yield* (yield* Shell).hc(jobArgs(job));
	return yield* fromOption(startedAddress(run.stdout)).pipe(mapError(() => new JobNotStarted({ reason: lastLine(run.stderr) || "hc printed no terminal address" })));
});
/**
* Waits for the job in terminal `addr` to end: its exit code; none when it was lost (its
* terminal is gone, or hc gave no answer). Each wait is hc's own, a minute at most, so
* nothing here waits on a clock Herdr doesn't have.
*/
const waitForJob = (addr) => gen(function* () {
	const run = yield* (yield* Shell).hc([
		"wait",
		addr,
		"--json",
		"--timeout",
		"60"
	]);
	const seen = waitResult(run.stdout);
	switch (seen._tag) {
		case "Ended": return some(seen.code);
		case "Lost": return none();
		case "Running": return yield* waitForJob(addr);
	}
});
/**
* Whether `folder` is a folder on `machine`, checked there. The test exits 1 for "no";
* any other failure (the machine can't be reached) is the check's own error.
*/
const isFolder = fn("isFolder")(function* (folder, machine) {
	return yield* (yield* Shell).exec("sh", [
		"-c",
		"[ -d \"$1\" ]",
		"sh",
		folder
	], onMachine(machine, {})).pipe(as(true), catchIf((failed) => failed._tag === "CommandFailed" && failed.code === 1, () => succeed(false)));
});
/** Which of `folders` on `machine` no longer exist, checked there. */
const goneFolders = fn("goneFolders")(function* (folders, machine = null) {
	if (folders.length === 0) return [];
	return (yield* runScript("the removed folders' check", GONE_SCRIPT, folders, { on: machine })).stdout.split("\n").filter((line) => line !== "");
});
/** Stops the job in terminal `addr`. */
const stopJob = fn("stopJob")(function* (addr) {
	yield* (yield* Shell).hc(["kill", addr]);
});
/** Shows `path` in the Finder. */
const reveal = fn("reveal")(function* (path) {
	yield* (yield* Shell).exec("open", [path]);
});
/** A new private temp folder (`mktemp -d`) on `machine`, for a job's answer file. */
const makeTempDir = fn("makeTempDir")(function* (machine = null) {
	const dir = (yield* (yield* Shell).exec("mktemp", ["-d"], runOn(machine))).stdout.trim();
	if (dir === "") return yield* new CommandFailed({
		command: "mktemp",
		code: 0,
		stderr: "mktemp printed no folder"
	});
	return dir;
});
/** Removes the folder at `dir` on `machine` and everything in it. */
const removeDir = fn("removeDir")(function* (dir, machine = null) {
	yield* (yield* Shell).exec("rm", ["-rf", dir], runOn(machine));
});
/** Removes the ended job's terminal from herdr-core. */
const removeTerminal = fn("removeTerminal")(function* (addr) {
	yield* (yield* Shell).hc(["rm", addr]);
});

// src/load.ts
/**
* The settings, read from `files.path`, after the one-time import of the old mod's
* settings when there is no settings file yet and the import isn't `settled`. A
* successful import deletes the old file; a failed one leaves it.
*/
const loadSettings = fn("loadSettings")(function* (files, settled) {
	const disk = yield* Files;
	const readOrNull = (path) => disk.read(path).pipe(catchTag("FileMissing", () => succeed(null)));
	const text = yield* readOrNull(files.path);
	const legacy = text === null && !settled ? yield* readOrNull(files.legacyPath) : null;
	const plan = planImport(text, legacy, settled);
	const loaded = (now) => ({
		parsed: parseSettings(now, files.name),
		settled: plan.settled,
		leftover: none()
	});
	if (isNone(plan.write)) return loaded(text);
	const created = yield* result(disk.create(files.path, plan.write.value));
	if (isSuccess(created)) {
		const removed = yield* result(disk.remove(files.legacyPath));
		const imported = loaded(plan.write.value);
		if (isSuccess(removed)) return imported;
		const why = `${lastSegment(files.legacyPath)}: imported, but couldn't delete it (${causeText(removed.failure.cause)})`;
		return {
			...imported,
			leftover: some(why)
		};
	}
	if (created.failure._tag === "FileError") {
		const what = `${files.name}: couldn't create it from ${lastSegment(files.legacyPath)}`;
		return defaultsBecause(what, created.failure, false);
	}
	return loaded(yield* readOrNull(files.path));
}, (effect, _files, settled) => effect.pipe(catchTag("FileError", (failed) => succeed(defaultsBecause(`${lastSegment(failed.path)}: couldn't read it`, failed, settled)))));
const defaultsBecause = (what, failed, settled) => ({
	parsed: {
		settings: DEFAULT_SETTINGS,
		error: some(`${what} (${causeText(failed.cause)})`)
	},
	settled,
	leftover: none()
});
/** What a folder scan scans, as a key: a scan is due again when it changes. */
const scanKey = ({ folders, depth, skip }) => JSON.stringify({
	folders,
	depth,
	skip
});
/** An effect's failure as its one-line reason, so the effect itself never fails. */
const asReason = (effect) => effect.pipe(result, map(mapError$2(failureText)));
/**
* Searches `machine`: scans its group folders when `scan` says to (after reading its
* home there; this machine's is `home`), else keeps the scan of its `last` search, and
* looks up the repos its open spaces (`places`) are in.
*/
const searchOn = fnUntraced(function* (settings, machine, home, places, scan, last) {
	const scans = scan && settings.folders.some((folder) => folder.machine === machine);
	const found = !scans ? flatMap$3(last, (before) => before.home) : some(machine === null ? home : yield* machineHome(machine));
	return {
		machine,
		home: found,
		scan: scans ? yield* scanRepos(settings, machine, /* @__PURE__ */ new Map([[machine, getOrElse$1(found, () => home)]])) : match$5(last, {
			onNone: () => ({
				repos: [],
				missing: []
			}),
			onSome: (before) => before.scan
		}),
		owners: yield* reposOf(places.filter((place) => place.machine === machine).map((place) => place.folder), machine)
	};
});
/** The machines a search covers: those with group folders, and those with open spaces. */
const machinesOf$1 = (settings, places) => Array.from(/* @__PURE__ */ new Set([...settings.folders.map((folder) => folder.machine), ...places.map((p) => p.machine)]));
/**
* `machine`'s search, or the status saying why it couldn't run there: its state in
* `states`, or its failure, a bug included. A machine never scanned (or every machine,
* when `rescan`) scans its group folders.
*/
const searchMachine = (ask, machine) => {
	const held = statusOf$1(ask.states, machine);
	if (isSome(held)) return succeed(fail$2(held.value));
	const last = flatMap$3(fromNullishOr(ask.last.get(machine)), getSuccess);
	const scan = ask.rescan || !exists(last, (before) => isSome(before.home));
	return searchOn(ask.settings, machine, ask.home, ask.places, scan, last).pipe(map((found) => succeed$3(found)), catch_((failed) => succeed(slotsFull(failed) && isSome(last) ? succeed$3(last.value) : fail$2({
		_tag: "Down",
		reason: failureText(failed)
	}))), catchDefect((defect) => succeed(fail$2({
		_tag: "Down",
		reason: defectText(defect)
	}))));
};
/**
* One refresh of every machine in `ask` not busy, side by side: each machine's search,
* handed to `onSearch` as it lands, which answers with that machine's repos to read; then
* those repos' lists in one batched read, handed to `onLists`; then `onDone`, however the
* machine's refresh ended. No machine waits on another. A machine whose search failed
* reads no lists; this machine's lists are read even then, from the repos it kept.
*/
const refreshMachines = (ask, onSearch, onLists, onDone = () => void 0) => forEach(machinesOf$1(ask.settings, ask.places).filter((machine) => !ask.busy.has(machine)), (machine) => searchMachine(ask, machine).pipe(flatMap((search) => sync(() => onSearch(machine, search)).pipe(flatMap((repos) => readLists(repos.filter((repo) => repo.machine === machine), machine !== null && isFailure(search) ? /* @__PURE__ */ new Map([[machine, search.failure]]) : /* @__PURE__ */ new Map(), onLists)))), ensuring(sync(() => onDone(machine)))), {
	concurrency: "unbounded",
	discard: true
});
/**
* `search` of `machine` landed. Another machine's failure is its status; this machine's
* is the error, and its last search that worked stays, so its repos stay listed. A
* search that works clears the machine's status, one a failed list read gave included.
*/
const landSearch = (landed, machine, search) => {
	const here = machine === null;
	const searches = new Map([...landed.searches, [machine, search]]);
	return match$4(search, {
		onSuccess: () => ({
			searches,
			error: here ? none() : landed.error,
			statuses: new Map([...landed.statuses].filter(([at]) => at !== machine))
		}),
		onFailure: (status) => here ? {
			...landed,
			error: some(status._tag === "Down" ? status.reason : "connecting")
		} : {
			...landed,
			searches,
			statuses: new Map([...landed.statuses, [machine, status]])
		}
	});
};
/**
* The repos to list, from each machine's search in `searches` (only the machines `settings`
* and `places` cover): the folder scans' plus the repos the open spaces are in and the
* Current repo (`current`), less the hidden ones. A machine whose search failed gives up
* its repos.
*/
const foundOf = (settings, home, places, searches, current = none()) => {
	const searched = machinesOf$1(settings, places).flatMap((machine) => toArray(map$3(fromNullishOr(searches.get(machine)), (result) => ({
		machine,
		result
	}))));
	const ok = searched.flatMap(({ result }) => toArray(getSuccess(result)));
	const scans = ok.flatMap((found) => toArray(map$3(found.home, (at) => ({
		...found,
		home: at
	}))));
	const scanned = {
		repos: scans.flatMap((found) => found.scan.repos),
		missing: scans.flatMap((found) => found.scan.missing),
		homes: new Map([[null, home], ...scans.map((found) => [found.machine, found.home])]),
		machines: scans.map((found) => found.machine)
	};
	const repos = reposFrom(scanned.repos, [...ok.flatMap((found) => found.owners), ...toArray(current)], settings.folders, scanned.homes);
	return {
		scanned,
		repos: withoutHidden(repos, settings.hidden),
		statuses: new Map(searched.flatMap(({ machine, result }) => toArray(map$3(getFailure(result), (status) => [machine, status]))))
	};
};
/**
* The Current repo: the repo `focused` (the focused folder, looked up on its machine;
* empty for none) is in, if any, the one-line reason the lookup failed, or `BUSY` when
* the machine had no free exec slot to run it.
*/
const lookUpCurrent = fn("lookUpCurrent")(function* (focused) {
	return yield* repoAt(focused.folder, focused.machine);
}, (effect) => effect.pipe(map((found) => succeed$3(found)), catch_((failed) => succeed(slotsFull(failed) ? BUSY : fail$2(failureText(failed))))));
/**
* What the worktree dialog in `mode` opens with, for the repo `at` (a folder on a
* machine; an empty folder for none) is in: that repo and the branch the folder is on,
* and the `listed` repos to pick from, by folder name. None when there is no repo at
* all. A lookup that fails is its one-line reason.
*/
const dialogFor = fn("dialogFor")(function* ({ machine, folder }, listed, mode = "new") {
	const found = yield* repoAt(folder, machine);
	const branch = isSome(found) ? yield* branchAt(folder, machine) : none();
	const repos = [...listed].sort((a, b) => lastSegment(a.root).localeCompare(lastSegment(b.root)));
	const props = {
		mode,
		repo: map$3(found, ({ machine, root }) => ({
			machine,
			root
		})),
		branch,
		repos
	};
	return isNone(found) && repos.length === 0 ? none() : some(props);
}, asReason);
/** The worktrees and branches of `repo`, for the New-or-open dialog. */
const readDialogRepo = (repo) => all({
	list: readList(repo),
	branches: readBranches(repo)
}, { concurrency: 2 });
/** The branches of `repo`, or the one-line reason the read failed. */
const readBranches = fn("readBranches")(function* (repo) {
	return yield* gitBranches(repo);
}, asReason);
/** The worktrees of `repo`, or the one-line reason the read failed. */
const readList = fn("readList")(function* (repo) {
	return yield* wtList(repo);
}, asReason);
/**
* The Merge or Remove a space's menu asks for, of the worktree the space's folder
* `folder` is in on `machine`: found through its repo and that repo's list, read now on
* that machine, since the panel may not list the repo (hidden, or outside the group
* folders). A failure, or a worktree that can't be merged or removed, is its one-line
* reason.
*/
const spaceWorktree = (act, { machine, folder }) => holderRepo(folder, machine).pipe(map(flatMap$2(match$5({
	onNone: () => fail$2(`${folder} isn't in a git repo.`),
	onSome: ({ repo, worktrees }) => spaceWorktreeAction(act, repo, worktrees, folder)
}))));
/** The repo `folder` on `machine` is in, with its worktrees; none outside every repo. */
const holderRepo = fn("holderRepo")(function* (folder, machine) {
	const found = yield* repoAt(folder, machine);
	if (isNone(found)) return none();
	const worktrees = yield* wtList(found.value);
	return some({
		repo: found.value,
		worktrees
	});
}, asReason);
/**
* Reads every repo's worktrees with one batched `wt list` per machine, the machines side
* by side, handing each machine's answer to `keep` as it lands. A machine in `skip`
* (connecting, or found down) runs nothing and gets that status.
*/
const readLists = (repos, skip, keep) => {
	const machines = Array.from(new Set(repos.map((repo) => repo.machine)));
	const held = machines.flatMap((machine) => toArray(map$3(fromNullishOr(skip.get(machine)), (status) => [machine, status])));
	return sync(() => held.forEach(([machine, status]) => keep(machine, fail$2(status)))).pipe(andThen(forEach(machines.filter((machine) => !skip.has(machine)), (machine) => machineLists(machine, repos.filter((repo) => repo.machine === machine).map((repo) => repo.root)).pipe(tap((answer) => sync(() => keep(machine, answer)))), {
		concurrency: "unbounded",
		discard: true
	})));
};
/** The batched list read of `roots` on `machine`, keyed by `repoKey`. */
const machineLists = (machine, roots) => wtLists(machine, roots).pipe(map((lists) => succeed$3(new Map(Array.from(lists, ([root, list]) => [repoKey({
	machine,
	root
}), list])))), catch_((failed) => succeed(slotsFull(failed) ? succeed$3(/* @__PURE__ */ new Map()) : fail$2({
	_tag: "Down",
	reason: failureText(failed)
}))), catchDefect((defect) => succeed(fail$2({
	_tag: "Down",
	reason: defectText(defect)
}))));
/** A defect, a bug, as its one-line reason. */
const defectText = (defect) => `a bug: ${String(defect)}`;
/** `read`, with a defect, a bug, as its failed answer, so the panel shows it like any other. */
const defectAsReason = (read) => read.pipe(catchDefect((defect) => succeed(fail$2(defectText(defect)))));
/** The worktrees of `repo` with their CI, or the one-line reason the read failed. */
const readCi = fn("readCi")(function* (repo) {
	return yield* wtCi(repo);
}, asReason);
/**
* Runs `read` on every repo, at most `limit` at a time, handing each answer to `keep` as
* it lands. Each read spawns processes, and Herdr runs out of open files when every
* repo's list and CI start at once.
*/
const readEach = (repos, limit, read, keep) => forEach(repos, (repo) => read(repo).pipe(tap((answer) => sync(() => keep(repo, answer)))), {
	concurrency: limit,
	discard: true
});
/**
* The "run herdr:sync" toast to show, from the sync record at `path`, the installed Herdr
* version and the version the toast was last shown for (see `syncNotice`). A record that
* can't be read is its one-line reason.
*/
const syncToast = fn("syncToast")(function* (path, installed, told) {
	const record = yield* (yield* Files).read(path).pipe(asSome, catchTag("FileMissing", () => succeed(none())));
	return succeed$3(syncNotice(record, installed, told));
}, (effect, path) => effect.pipe(catchTag("FileError", (failed) => succeed(fail$2(`${lastSegment(path)}: couldn't read it (${causeText(failed.cause)})`)))));
/** The settings file doesn't parse, so it is never written over; `reason` says why. */
var SettingsBroken = class extends TaggedError("SettingsBroken") {};
/** The settings file couldn't be read, so nothing can be written over it safely. */
var SettingsUnreadable = class extends TaggedError("SettingsUnreadable") {};
/** The settings file's text now; null when there is none. */
const currentSettings = fnUntraced(function* (path) {
	return yield* (yield* Files).read(path).pipe(catchTag("FileMissing", () => succeed(null)), mapError((failed) => new SettingsUnreadable({ cause: failed.cause })));
});
/** What the panel says about a settings file it couldn't read. */
const unreadableText = (name, failed) => `${name}: couldn't read it (${causeText(failed.cause)})`;
/** What the panel says about a settings file it couldn't write. */
const unsavedText = (name, failed) => `${name}: couldn't save it (${causeText(failed.cause)})`;
/**
* Hides `repo` (by machine and folder) in the settings file (`files.path`), never over a hand edit
* made since it was read. The answer is the one-line reason it couldn't, if it couldn't.
*/
const hideInSettings = fn("hideInSettings")(function* (files, repo) {
	const disk = yield* Files;
	const current = yield* currentSettings(files.path);
	const next = yield* fromResult(hideRepo(current, repo, files.name)).pipe(mapError((reason) => new SettingsBroken({ reason })));
	if (next === current) return succeed$3(void 0);
	yield* current === null ? disk.create(files.path, next) : disk.replace(files.path, next, current);
	return succeed$3(void 0);
}, (effect, files) => effect.pipe(catchTags({
	SettingsBroken: (broken) => succeed(fail$2(broken.reason)),
	SettingsUnreadable: (failed) => succeed(fail$2(unreadableText(files.name, failed))),
	WriteConflict: () => succeed(fail$2(`${files.name} changed while hiding the repo: try again.`)),
	FileError: (failed) => succeed(fail$2(unsavedText(files.name, failed)))
})));
/** What the panel says about a file it couldn't read: one line. */
const fileFailureText = (failed) => failed._tag === "FileMissing" ? `${failed.path} is missing` : causeText(failed.cause);
/** A step that failed as its one line, `what` went wrong and why; nothing when it worked. */
const problemOf = (step, what) => isFailure(step) ? [`${what}: ${failureText(step.failure)}`] : [];
/**
* Runs `spec` as a job on its machine, in the person's login shell there, in a
* background terminal: `shown` gets its address as soon as it starts (to open its
* window), then this waits for it to end, removes its terminal and checks, on that
* machine, which of its folders are gone.
*/
const runJob = fn("runJob")(function* (spec, shown) {
	const shell = yield* loginShell(spec.on);
	const addr = yield* startJob({
		cwd: spec.cwd,
		shell,
		body: spec.body,
		on: spec.on
	});
	yield* sync(() => shown(addr));
	const waited = yield* result(waitForJob(addr));
	const removed = yield* result(removeTerminal(addr));
	const checked = yield* result(goneFolders(spec.gone, spec.on));
	return {
		_tag: "Ended",
		code: getOrElse(waited, () => none()),
		gone: getOrElse(checked, () => []),
		problems: [
			...problemOf(waited, "Lost track of the job"),
			...problemOf(removed, "Couldn't remove the job's terminal"),
			...problemOf(checked, "Couldn't check which folders went, so no space was closed")
		]
	};
}, (effect, spec) => effect.pipe(catchTags({
	JobNotStarted: (failed) => succeed({
		_tag: "NotStarted",
		reason: failed.reason
	}),
	ShellError: (failed) => succeed({
		_tag: "NotStarted",
		reason: failureText(failed)
	}),
	LoginShellUnknown: (failed) => succeed({
		_tag: "NotStarted",
		reason: `couldn't find your login shell: ${failed.reason}`
	})
}), map((outcome) => outcomeOn(spec.on, outcome))));
/** `text` named as `machine`'s, so a failure says where to look; this machine's as is. */
const onMachineText = (machine, text) => machine === null ? text : `On ${machineName(machine)}: ${text}`;
/** `outcome` with its reason or problems named as `machine`'s. */
const outcomeOn = (machine, outcome) => outcome._tag === "NotStarted" ? {
	...outcome,
	reason: onMachineText(machine, outcome.reason)
} : {
	...outcome,
	problems: outcome.problems.map((line) => onMachineText(machine, line))
};
/** The worktree wt's answer file names, from its `read`, or the one line saying why not. */
const switchedFrom = (read) => match$4(read, {
	onFailure: (failed) => fail$2(`Couldn't read wt's answer, so no space was opened: ${fileFailureText(failed)}`),
	onSuccess: (text) => fromOption$2(switchedTo(text), () => `wt's answer names no branch and folder, so no space was opened: ${text.trim()}`)
});
/**
* Switches to or creates the worktree for `name` in the repo at `main` on `machine` as a
* job (see `runJob`), its JSON answer written to a private temp folder there, read back
* from there, and removed after. The folder must be on the job's machine: wt writes it
* there, and Herdr reads files on any machine.
*/
const newWorktree = fn("newWorktree")(function* (target, shown) {
	const disk = yield* Files;
	const dir = yield* makeTempDir(target.machine).pipe(mapError((failed) => new JobNotStarted({ reason: `couldn't make a temp folder: ${failureText(failed)}` })));
	const out = `${dir}/switch.json`;
	const spec = {
		title: `Open or create ${target.name}`,
		cwd: target.main,
		body: newScript({
			...target,
			base: fromNullishOr(target.base),
			out
		}),
		gone: [],
		on: target.machine
	};
	const outcome = yield* runJob(spec, shown);
	const read = outcome._tag === "Ended" && contains(outcome.code, 0) ? some(yield* result(disk.read(out, target.machine))) : none();
	const removed = yield* result(removeDir(dir, target.machine));
	const switched = map$3(read, switchedFrom);
	return {
		outcome,
		switched: flatMap$3(switched, getSuccess),
		problems: [...toArray(flatMap$3(switched, getFailure)), ...problemOf(removed, `Couldn't remove the temp folder ${dir}`)].map((line) => onMachineText(target.machine, line))
	};
}, (effect, target) => effect.pipe(catchTag("JobNotStarted", (failed) => succeed({
	outcome: {
		_tag: "NotStarted",
		reason: onMachineText(target.machine, failed.reason)
	},
	switched: none(),
	problems: []
}))));
/** The group folder picked in the system's folder picker (none if cancelled), or why it couldn't open. */
const pickGroupFolder = fn("pickGroupFolder")(function* () {
	const picked = yield* (yield* Files).pickFolder("Add group folder");
	return succeed$3(picked);
}, catchTag("PickerFailed", (failed) => succeed(fail$2(`couldn't open the folder picker (${causeText(failed.cause)})`))));
/**
* The settings with the folder typed as `typed` on `machine` added as a group, once a
* check run there finds it (`~` is that machine's home, read there). A folder that isn't
* there, or a check that can't run, is the answer's reason instead: nothing is added.
*/
const addGroupFolderOn = fn("addGroupFolderOn")(function* (settings, machine, typed) {
	const path = typed.trim();
	if (path === "") return fail$2(`Type the folder's path on ${machine}`);
	const home = yield* machineHome(machine);
	return (yield* isFolder(expandHome(path, home), machine)) ? succeed$3(addFolderOn(settings, machine, path, home)) : fail$2(`${path} isn't a folder on ${machine}`);
}, (effect, _settings, machine, typed) => {
	const cantCheck = (failed) => succeed(fail$2(`couldn't check ${typed.trim()} on ${machine}: ${failureText(failed)}`));
	return effect.pipe(catchTags({
		CommandFailed: cantCheck,
		ShellError: cantCheck
	}));
});
/** The settings file's text for the Settings dialog to open on (null: no file), or why it can't be read. */
const settingsText = fn("settingsText")(function* (files) {
	return succeed$3(yield* currentSettings(files.path));
}, (effect, files) => effect.pipe(catchTag("SettingsUnreadable", (failed) => succeed(fail$2(unreadableText(files.name, failed))))));
/** The settings file changed since the Settings dialog opened on it. */
var SettingsChanged = class extends TaggedError("SettingsChanged") {};
const CHANGED_TEXT = "The settings file changed since this dialog opened, so nothing was saved. Close and open Settings again to edit the new file.";
/**
* Saves `settings` from the Settings dialog to the settings file (`files.path`), whose
* text was `opened` when the dialog opened (null: no file), never over a hand edit made
* since. The answer is the one-line reason it couldn't, if it couldn't.
*/
const saveSettings = fn("saveSettings")(function* (files, opened, settings) {
	const disk = yield* Files;
	const onDisk = yield* currentSettings(files.path);
	const plan = planSave(opened, onDisk, settings, files.name);
	switch (plan._tag) {
		case "Broken": return yield* new SettingsBroken({ reason: `${plan.error}. Fix the file by hand; Settings can't save over it.` });
		case "Changed": return yield* new SettingsChanged();
		case "Write":
			yield* plan.expected === null ? disk.create(files.path, plan.text) : disk.replace(files.path, plan.text, plan.expected);
			return succeed$3("Saved");
		case "Unchanged": return succeed$3("Unchanged");
	}
}, (effect, files) => effect.pipe(catchTags({
	SettingsBroken: (broken) => succeed(fail$2(broken.reason)),
	SettingsChanged: () => succeed(fail$2(CHANGED_TEXT)),
	WriteConflict: () => succeed(fail$2(CHANGED_TEXT)),
	SettingsUnreadable: (failed) => succeed(fail$2(unreadableText(files.name, failed))),
	FileError: (failed) => succeed(fail$2(unsavedText(files.name, failed)))
})));
/**
* Which of the dropped `paths` on `machine` are gone, from one folder check there; a
* failed check is its one-line reason, so no space closes on a guess.
*/
const checkGone = fn("checkGone")(function* (paths, machine) {
	const checked = yield* result(goneFolders(paths, machine));
	return mapError$2(checked, failureText);
});

// src/spaces.ts
/**
* Where each space is now, on its machine: its first pane's live folder, else the folder
* it was made in. Spaces with no folder at all are left out.
*/
const spacePlaces = (spaces, panes) => spaces.flatMap((space) => {
	const tabs = new Set(space.tabs.map((tab) => tab.id));
	const place = panes.find((pane) => tabs.has(pane.tab) && pane.cwd)?.cwd || space.folder;
	return place ? [{
		space: {
			id: space.id,
			active: space.active
		},
		machine: space.machine,
		place
	}] : [];
});
/**
* The space on each of the worktree paths on `machine`. Only spaces on that machine
* count: a folder of the same path elsewhere is another folder. A space sits on the
* longest worktree path that contains its place, so a worktree nested in another's
* folder still gets its own. When several sit on one worktree, the shown one wins, else
* the first.
*/
const spacesOnWorktrees = (places, machine, paths) => places.filter((place) => place.machine === machine).flatMap(({ space, place }) => {
	const longest = paths.filter((path) => isUnder(place, path)).reduce((best, path) => isSome(best) && best.value.length >= path.length ? best : some(path), none());
	return match$5(longest, {
		onNone: () => [],
		onSome: (path) => [{
			path,
			space
		}]
	});
}).reduce((on, { path, space }) => {
	const held = on.get(path);
	if (held && (held.active || !space.active)) return on;
	return new Map([...on, [path, space]]);
}, /* @__PURE__ */ new Map());
/**
* The ids of the spaces on `machine` whose folder (where the space was made) or place
* (where its first terminal is now) is one of the `gone` folders there, or inside one. A
* space on another machine never matches: the same path there is another folder.
* Both count because wt moves a removed worktree into a trash folder and a shell inside
* it moves too, so the place alone can point somewhere that still exists.
*/
const spacesInGone = (spaces, panes, machine, gone) => {
	const inGone = (path) => gone.some((folder) => isUnder(path, folder));
	const places = new Map(spacePlaces(spaces, panes).map(({ space, place }) => [space.id, place]));
	return spaces.filter((space) => space.machine === machine).filter((space) => inGone(space.folder) || inGone(places.get(space.id) ?? "")).map((space) => space.id);
};
/**
* The folder the person is working in, on the focused space's machine: the focused
* terminal's, else (a mod pane or the panel itself has focus) where the focused space
* is, so focusing the panel keeps it. A terminal on this machine that has run `ssh`
* still counts as this machine: Herdr knows only the space's machine.
*/
const focusedFolder = (focus, places) => {
	const at = fromNullishOr(places.find((p) => p.space.id === focus?.space));
	const machine = match$5(at, {
		onNone: () => null,
		onSome: (p) => p.machine
	});
	return orElse(map$3(fromNullishOr(focus?.cwd || null), (folder) => ({
		machine,
		folder
	})), () => map$3(at, (p) => ({
		machine: p.machine,
		folder: p.place
	})));
};
/**
* The focused folder (see `focusedFolder`), or this machine with no folder when nothing
* is focused: what the panel looks up when it needs a place to start.
*/
const focusedOrHere = (focus, places) => getOrElse$1(focusedFolder(focus, places), () => ({
	machine: null,
	folder: ""
}));
/**
* The Herdr command a click on a worktree row runs: select its space, or open a new one
* on the worktree's machine (Herdr's `space.new` takes no machine for this one).
*/
const clickCommand = (click) => click._tag === "Select" ? {
	command: "space.select",
	args: { id: click.space }
} : {
	command: "space.new",
	args: {
		name: click.name,
		folder: click.folder,
		...click.machine === null ? {} : { machine: click.machine }
	}
};
/** The space to go to for `wanted`: the one on it, else a new one there. */
const goTo = (places, wanted) => match$5(fromNullishOr(spacesOnWorktrees(places, wanted.machine, [wanted.folder]).get(wanted.folder)), {
	onSome: (on) => ({
		_tag: "Select",
		space: on.id
	}),
	onNone: () => ({
		_tag: "New",
		...wanted
	})
});
/**
* Each space's group, by space id, for the sidebar's labels: the group of the repo whose
* worktree the space sits on, on the space's machine. As in `spacesOnWorktrees`, the
* longest worktree path holding the space's place wins, across every repo there, so a
* repo nested in another's folder keeps its own group. A repo whose list isn't read yet
* counts its main checkout. Spaces on no repo, or on a repo in Other (which the panel
* shows with no group), are left out.
*/
const spaceGroups = (places, repos, lists) => Object.fromEntries(places.flatMap(({ space, machine, place }) => repos.filter((repo) => repo.machine === machine).flatMap((repo) => (lists.get(repoKey(repo))?.worktrees.map((w) => w.path) ?? [repo.root]).filter((path) => isUnder(place, path)).map((path) => ({
	path,
	group: repo.group
}))).reduce((best, on) => best[0] && best[0].path.length >= on.path.length ? best : [on], []).filter((on) => on.group !== OTHER).map((on) => [space.id, on.group])));
/**
* Whether `groups` differ from those `published` in shared state (anything at all, since
* any mod can write it): publishing only on a change spares every mod a render.
*/
const groupsChanged = (groups, published) => {
	const entries = Object.entries(groups);
	return !isObject(published) || Object.keys(published).length !== entries.length || entries.some(([space, group]) => Reflect.get(published, space) !== group);
};

// src/orphans.ts
const NO_ORPHANS = {
	waiting: /* @__PURE__ */ new Map(),
	removed: /* @__PURE__ */ new Map(),
	asked: /* @__PURE__ */ new Set()
};
/** The dropped paths on `machine` waiting for a folder check: what the next check asks about. */
const waitingOn = (orphans, machine) => orphans.waiting.get(machine) ?? [];
/**
* The panel's own job removed the folders `gone` on `machine`: never dropped paths. Those
* a list read already dropped stop waiting (a check running on them returns none of
* them); the rest are left out of the next read that drops them.
*/
const jobRemoved = (orphans, machine, gone) => {
	const waits = waitingOn(orphans, machine);
	return {
		...orphans,
		waiting: new Map([...orphans.waiting, [machine, waits.filter((path) => !gone.includes(path))]]),
		removed: new Map([...orphans.removed, [machine, [...orphans.removed.get(machine) ?? [], ...gone.filter((path) => !waits.includes(path))]]])
	};
};
/**
* What the panel remembers after `machine`'s batched list read answers, given each repo's
* list from before (`old`). A folder a job removed is left out of the dropped paths, and
* forgotten by the first fresh read of its repo, whether that read dropped it or lists it
* again (a worktree made there anew), so its later removal in a terminal counts.
*/
const listsRead = (orphans, old, machine, answer) => {
	const reads = match$4(answer, {
		onFailure: () => [],
		onSuccess: (lists) => Array.from(lists).flatMap(([key, list]) => match$4(list, {
			onFailure: () => [],
			onSuccess: (worktrees) => {
				const now = worktrees.map((w) => w.path);
				const before = (old.get(key)?.worktrees ?? []).map((w) => w.path);
				return [{
					dropped: before.filter((path) => !now.includes(path)),
					seen: [...before, ...now]
				}];
			}
		}))
	});
	const dropped = reads.flatMap((fresh) => fresh.dropped);
	const seen = reads.flatMap((fresh) => fresh.seen);
	const removed = orphans.removed.get(machine) ?? [];
	return {
		...orphans,
		waiting: new Map([...orphans.waiting, [machine, [...waitingOn(orphans, machine), ...dropped.filter((path) => !removed.includes(path))]]]),
		removed: new Map([...orphans.removed, [machine, removed.filter((path) => !seen.includes(path))]])
	};
};
/**
* The folder check of the paths `asked` on `machine` answered: the folders it found gone,
* or why it failed. Gone paths come back for their spaces to close or be asked about; a
* path whose folder exists is forgotten; a failed check leaves every path waiting for the
* machine's next refresh. Paths dropped while the check ran wait on.
*/
const checked = (orphans, machine, asked, answer) => match$4(answer, {
	onFailure: () => ({
		orphans,
		gone: []
	}),
	onSuccess: (gone) => ({
		orphans: {
			...orphans,
			waiting: new Map([...orphans.waiting, [machine, waitingOn(orphans, machine).filter((path) => !asked.includes(path))]])
		},
		gone: gone.filter((path) => asked.includes(path) && waitingOn(orphans, machine).includes(path))
	})
});
const closeOrAsk = (space, panes) => {
	const tabs = new Set(space.tabs.map((tab) => tab.id));
	return panes.filter((pane) => tabs.has(pane.tab) && pane.terminal !== null).every((pane) => pane.program?.shell === true) ? "Close" : "Ask";
};
/**
* The orphan spaces on `machine`: every space there on one of the `gone` folders (by
* folder or place, as `spacesInGone` matches them), each closed or asked about.
*/
const orphanSpaces = (spaces, panes, machine, gone) => {
	const ids = new Set(spacesInGone(spaces, panes, machine, gone));
	return spaces.filter((space) => ids.has(space.id)).map((space) => ({
		space: space.id,
		step: closeOrAsk(space, panes)
	}));
};
/**
* The toasts for the orphan spaces on `machine` (as `orphanSpaces` finds them) where
* something other than a shell runs and no toast has asked before: each names the space
* and the gone folder it is on, and clicking it closes the space after Herdr's own
* confirm. The spaces asked about are remembered, so a later check never asks again.
*/
const askToasts = (orphans, spaces, panes, machine, gone) => {
	const asks = new Set(orphanSpaces(spaces, panes, machine, gone).filter((orphan) => orphan.step === "Ask" && !orphans.asked.has(orphan.space)).map((orphan) => orphan.space));
	const places = new Map(spacePlaces(spaces, panes).map(({ space, place }) => [space.id, place]));
	const goneUnder = (path) => gone.find((folder) => isUnder(path, folder));
	const toasts = spaces.filter((space) => asks.has(space.id)).map((space) => {
		const folder = goneUnder(space.folder) ?? goneUnder(places.get(space.id) ?? "") ?? "";
		return {
			title: "Space on a removed worktree",
			body: `${space.name} is on ${folder}, which is gone. Something is still running in it. Click to close it.`,
			level: "warning",
			action: {
				name: "space.close",
				args: {
					id: space.id,
					confirmed: false
				}
			}
		};
	});
	return {
		orphans: {
			...orphans,
			asked: /* @__PURE__ */ new Set([...orphans.asked, ...asks])
		},
		toasts
	};
};

// src/view.ts
/** Every view, in the picker's order, with its label. */
const SHOWS = [
	["current", "Current"],
	["repos", "Repos"],
	["merged", "Clean up"],
	["active", "Active"],
	["conflict", "Conflicts"],
	["open", "Open"]
];
const DEFAULT_VIEW_STATE = {
	group: none(),
	show: "repos",
	only: true,
	machine: none()
};
const CI_TOOLTIPS = {
	passed: "CI passed",
	running: "CI is running",
	failed: "CI failed",
	conflicts: "Conflicts with main",
	unknown: "No CI status"
};
/** What a row's CI badge means, for its hover label. */
const ciTooltip = (badge) => badge.stale ? `${CI_TOOLTIPS[badge.status]} on an older commit than the one pushed` : CI_TOOLTIPS[badge.status];
const SECTIONS = [
	["merged", "Merged · ready to clean up"],
	["active", "In progress"],
	["conflict", "Conflicts with main"]
];
/** The section a worktree goes in; none for the main checkout, which comes first. */
const kindOf = (worktree) => {
	switch (worktree.state._tag) {
		case "Main": return none();
		case "Merged": return some("merged");
		case "New":
		case "Active": return some("active");
		case "Conflict": return some("conflict");
	}
};
/** How long ago, shortest unit: 5m, 3h, 2d, 4mo. */
const age = (at, now) => {
	const seconds = Math.max(0, (now - at) / 1e3);
	if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
	if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
	if (seconds < 5184e3) return `${Math.round(seconds / 86400)}d`;
	return `${Math.round(seconds / 86400 / 30)}mo`;
};
const mainParts = (worktree) => {
	const sync = match$5(worktree.upstream, {
		onNone: () => [],
		onSome: (up) => [...up.behind > 0 ? [`↓${up.behind} behind remote`] : [], ...up.ahead > 0 ? [`↑${up.ahead} to push`] : []]
	});
	return sync.length > 0 ? sync : ["main checkout"];
};
const workParts = (worktree) => {
	const { ahead, behind, added, deleted, upstream } = worktree;
	const remoteBehind = getOrElse$1(map$3(upstream, (up) => up.behind), () => 0);
	return [
		`↑${ahead} ↓${behind} vs main`,
		...added > 0 || deleted > 0 ? [`+${added} −${deleted}`] : [],
		...remoteBehind > 0 ? [`↓${remoteBehind} remote`] : []
	];
};
const MERGE_REASONS = {
	trees_match: "same files as main",
	patch_id_match: "squash-merged",
	ancestor: "in main's history"
};
const stateParts = (worktree) => {
	const { state } = worktree;
	switch (state._tag) {
		case "Main": return mainParts(worktree);
		case "Merged": return [getOrElse$1(flatMap$3(state.reason, (r) => fromNullishOr(MERGE_REASONS[r])), () => "merged")];
		default: return workParts(worktree);
	}
};
/** The line under a row's branch name. */
const subline = (worktree, now) => [
	...stateParts(worktree),
	...worktree.dirty ? ["uncommitted changes"] : [],
	...toArray(map$3(worktree.committedAt, (at) => age(at, now)))
].join(" · ");
const badgeOf = (ci) => {
	switch (ci._tag) {
		case "NotAsked":
		case "None": return none();
		case "Checks": return some({
			status: ci.status,
			stale: ci.stale
		});
		case "Conflicts": return some({
			status: "conflicts",
			stale: false
		});
		case "Unknown": return some({
			status: "unknown",
			stale: false
		});
	}
};
/** The worktree's CI: from its repo's last CI read, else whatever its list carried. */
const ciOf = (snapshot, repo, worktree) => getOrElse$1(fromNullishOr(snapshot.ci.get(repoKey(repo))?.byPath.get(worktree.path)), () => worktree.ci);
const TONE_TOOLTIPS = {
	main: "Main checkout",
	merged: "Merged",
	active: "In progress",
	conflict: "Conflicts with main"
};
const dotTooltip = (tone, open) => `${TONE_TOOLTIPS[tone]} · ${open ? "open in a space" : "no space open"}`;
/** The hover label of the open marker: names the space's machine when it isn't this one. */
const openTooltip = (machine) => machine === null ? "Open in a space" : `Open in a space on ${machineName(machine)}`;
const rowView = (snapshot, repo, worktree, space) => {
	const tone = getOrElse$1(kindOf(worktree), () => "main");
	const isNew = worktree.state._tag === "New";
	const ci = badgeOf(ciOf(snapshot, repo, worktree));
	return {
		key: repoKey({
			machine: repo.machine,
			root: worktree.path
		}),
		repo: repo.root,
		label: getOrElse$1(worktree.branch, () => "(detached)"),
		tone,
		hollow: isNone(space),
		dirty: worktree.dirty,
		open: isSome(space),
		current: exists(space, (s) => s.active),
		subline: subline(worktree, snapshot.now),
		badge: isNew ? some("new") : none(),
		ci,
		tips: {
			dot: dotTooltip(tone, isSome(space)),
			badge: isNew ? some("No commits or changes yet") : none(),
			dirty: worktree.dirty ? some("Uncommitted changes") : none(),
			open: map$3(space, () => openTooltip(repo.machine)),
			ci: map$3(ci, ciTooltip)
		},
		click: match$5(space, {
			onNone: () => ({
				_tag: "New",
				name: worktree.state._tag === "Main" ? lastSegment(repo.root) : getOrElse$1(worktree.branch, () => lastSegment(worktree.path)),
				folder: worktree.path,
				machine: repo.machine
			}),
			onSome: (s) => ({
				_tag: "Select",
				space: s.id
			})
		})
	};
};
const newestFirst = (a, b) => getOrElse$1(b.committedAt, () => 0) - getOrElse$1(a.committedAt, () => 0);
const statusOf = (list) => match$5(list, {
	onNone: () => ({ _tag: "Reading" }),
	onSome: (l) => match$5(l.error, {
		onNone: () => ({ _tag: "Ok" }),
		onSome: (text) => ({
			_tag: "Error",
			text
		})
	})
});
const listOf = (snapshot, repo) => fromNullishOr(snapshot.lists.get(repoKey(repo)));
/** How many worktrees: wt list's answer once read, else the scan's. */
const countOf = (repo, list) => match$5(list, {
	onNone: () => repo.count,
	onSome: (l) => l.worktrees.length > 0 ? l.worktrees.length : repo.count
});
/** The search, lowercased; none when the box is empty. */
const queryOf = (snapshot) => liftPredicate(snapshot.search.trim().toLowerCase(), (q) => q !== "");
/** Does the search let this worktree through: its branch or its repo's name holds the text. */
const matches = (query, repo, worktree) => match$5(query, {
	onNone: () => true,
	onSome: (q) => lastSegment(repo.root).toLowerCase().includes(q) || exists(worktree.branch, (branch) => branch.toLowerCase().includes(q))
});
const nameMatches = (query, repo) => match$5(query, {
	onNone: () => true,
	onSome: (q) => lastSegment(repo.root).toLowerCase().includes(q)
});
const noMatch = (query) => `Nothing matches "${query}".`;
/** The machine `repo` is on, named only while the list holds repos on more than one. */
const machineLabel = (snapshot, repo) => liftPredicate(machineName(repo.machine), () => new Set(snapshot.repos.map((listed) => listed.machine)).size > 1);
/** A flat row's repo: its folder name, after its machine while more than one is listed. */
const flatRepoName = (snapshot, repo) => match$5(machineLabel(snapshot, repo), {
	onNone: () => lastSegment(repo.root),
	onSome: () => locatedLabel({
		machine: repo.machine,
		folder: lastSegment(repo.root)
	}, { nameHere: true })
});
const repoView = (repo, snapshot, places, { foldable } = { foldable: true }) => {
	const list = listOf(snapshot, repo);
	const all = match$5(list, {
		onNone: () => [],
		onSome: (l) => l.worktrees
	});
	const query = queryOf(snapshot);
	const worktrees = all.filter((w) => matches(query, repo, w));
	const searching = isSome(query);
	const key = repoKey(repo);
	const folded = foldable && !searching && snapshot.folded[key] === true;
	const on = spacesOnWorktrees(places, repo.machine, all.map((w) => w.path));
	const toRow = (worktree) => rowView(snapshot, repo, worktree, fromNullishOr(on.get(worktree.path)));
	const inSection = (kind) => worktrees.filter((w) => contains(kindOf(w), kind)).sort(newestFirst);
	return {
		key,
		name: lastSegment(repo.root),
		machine: machineLabel(snapshot, repo),
		group: repo.group === "Other" ? none() : some(repo.group),
		count: map$3(list, () => countOf(repo, list)),
		status: statusOf(list),
		ciNote: map$3(flatMap$3(fromNullishOr(snapshot.ci.get(key)), (ci) => ci.error), (error) => `CI status not updated: ${error}`),
		folded,
		foldable,
		main: folded ? [] : worktrees.filter((w) => isNone(kindOf(w))).map(toRow),
		sections: folded ? [] : SECTIONS.flatMap(([kind, label]) => {
			const rows = inSection(kind);
			const sectionKey = `${key}|${kind}`;
			const sectionFolded = !searching && snapshot.folded[sectionKey] === true;
			return rows.length === 0 ? [] : [{
				key: sectionKey,
				kind,
				label,
				count: rows.length,
				folded: sectionFolded,
				rows: sectionFolded ? [] : rows.map(toRow)
			}];
		})
	};
};
const emptyText = (snapshot) => {
	if (!snapshot.discovered) return "Looking for repos…";
	if (snapshot.settings.folders.length === 0) return `No repos yet. Add your repo folders in Settings, or in ${snapshot.settingsFile} in Herdr's folder.`;
	return "No repos found in your group folders.";
};
/** Group names in the group filter's order: Settings order, then unknown names sorted, then Other. */
const orderGroups = (names, settings) => {
	const have = new Set(names);
	const order = settings.folders.map((folder) => folder.name);
	const unknown = Array.from(have).filter((name) => !order.includes(name) && name !== "Other").sort();
	return Array.from(/* @__PURE__ */ new Set([
		...order.filter((name) => have.has(name)),
		...unknown,
		...have.has("Other") ? [OTHER] : []
	]));
};
/**
* The selected group. A saved group no repo is in any more falls back to All, but only
* once the repos are known, so a saved group never flashes back to All at start.
*/
const selectedGroup = ({ repos, discovered, view }) => filter(view.group, (group) => !discovered || repos.some((repo) => repo.group === group));
/** Every machine a repo or a group folder is on: this machine first, then by name. */
const machinesOf = ({ repos, settings }) => Array.from(/* @__PURE__ */ new Set([...repos.map((repo) => repo.machine), ...settings.folders.map((folder) => folder.machine)])).sort(byMachine);
/**
* The filtered machine. One no repo or folder is on any more falls back to All, but only
* once the repos are known, so a saved filter never flashes back to All at start.
*/
const selectedMachine = (scope) => filter(scope.view.machine, (machine) => !scope.discovered || machinesOf(scope).includes(machine));
/** The repos the machine filter lets through, in order. */
const reposOnMachine = (scope) => match$5(selectedMachine(scope), {
	onNone: () => scope.repos,
	onSome: (machine) => scope.repos.filter((repo) => repo.machine === machine)
});
/** The repos the machine filter and the group filter let through, in order. */
const reposInGroup = (scope) => {
	const repos = reposOnMachine(scope);
	return match$5(selectedGroup({
		...scope,
		repos
	}), {
		onNone: () => repos,
		onSome: (group) => repos.filter((repo) => repo.group === group)
	});
};
/**
* The repos worth reading: the selected group's; in the Current view the Current repo
* alone, or every repo on the filtered machines (for the Open list) when the focused
* folder is in none. None on a machine that can't be read now.
*/
const reposToRead = (scope) => {
	return (scope.view.show !== "current" ? reposInGroup(scope) : scope.current._tag === "InRepo" ? [scope.current.repo] : reposOnMachine(scope)).filter((repo) => !scope.machines.has(repo.machine));
};
const chipsOf = (snapshot) => {
	const selected = selectedGroup(snapshot);
	const groups = snapshot.discovered ? orderGroups(snapshot.repos.map((repo) => repo.group), snapshot.settings) : Array.from(new Set(snapshot.settings.folders.map((folder) => folder.name)));
	return [{
		label: "All",
		group: none(),
		selected: isNone(selected)
	}, ...groups.map((group) => ({
		label: group,
		group: some(group),
		selected: contains(selected, group)
	}))];
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const FLAT_EMPTY = {
	merged: "Nothing to clean up.",
	active: "No worktrees in progress.",
	conflict: "No worktrees conflict with main.",
	open: "No worktree has a space open."
};
const treeBody = (snapshot, places) => {
	const query = queryOf(snapshot);
	const repos = reposInGroup(snapshot).filter((repo) => !snapshot.view.only || countOf(repo, listOf(snapshot, repo)) > 1).filter((repo) => nameMatches(query, repo) || exists(listOf(snapshot, repo), (l) => l.worktrees.some((w) => matches(query, repo, w))));
	if (repos.length === 0) return {
		_tag: "Message",
		text: match$5(query, {
			onSome: noMatch,
			onNone: () => "No repos with worktrees here. Choose All repos to see the rest."
		})
	};
	return {
		_tag: "Tree",
		repos: repos.map((repo) => repoView(repo, snapshot, places))
	};
};
const flatBody = (snapshot, places, show, repos = reposInGroup(snapshot)) => {
	const query = queryOf(snapshot);
	const found = repos.flatMap((repo) => {
		const worktrees = match$5(listOf(snapshot, repo), {
			onNone: () => [],
			onSome: (list) => list.worktrees
		});
		const on = spacesOnWorktrees(places, repo.machine, worktrees.map((w) => w.path));
		return worktrees.filter((w) => show === "open" ? on.has(w.path) : contains(kindOf(w), show)).filter((w) => matches(query, repo, w)).map((worktree) => ({
			repo,
			worktree,
			space: fromNullishOr(on.get(worktree.path))
		}));
	});
	if (found.length === 0) {
		const unread = repos.some((repo) => !snapshot.lists.has(repoKey(repo)));
		const empty = match$5(query, {
			onSome: noMatch,
			onNone: () => FLAT_EMPTY[show]
		});
		return {
			_tag: "Message",
			text: unread ? "Reading…" : empty
		};
	}
	const repoCount = new Set(found.map(({ repo }) => repoKey(repo))).size;
	return {
		_tag: "Flat",
		summary: show === "merged" ? some(`${found.length} merged in ${plural(repoCount, "repo")}`) : none(),
		rows: [...found].sort((a, b) => newestFirst(a.worktree, b.worktree)).map(({ repo, worktree, space }) => {
			const row = rowView(snapshot, repo, worktree, space);
			return {
				...row,
				subline: `${flatRepoName(snapshot, repo)} · ${row.subline}`
			};
		})
	};
};
/**
* The Current repo as one expanded repo of the tree, whatever the group filter. Outside
* every repo: a line saying so, over the Open view's list across all repos.
*/
const currentBody = (snapshot, places) => {
	const { current } = snapshot;
	switch (current._tag) {
		case "NotInRepo": return {
			_tag: "NotInRepo",
			text: "Not in a repo",
			open: flatBody(snapshot, places, "open", snapshot.repos)
		};
		case "InRepo": {
			const query = queryOf(snapshot);
			const view = repoView(current.repo, snapshot, places, { foldable: false });
			const empty = view.main.length === 0 && view.sections.length === 0;
			if (isSome(query) && empty && view.status._tag !== "Reading") return {
				_tag: "Message",
				text: noMatch(query.value)
			};
			return {
				_tag: "Tree",
				repos: [view]
			};
		}
		case "Looking": return {
			_tag: "Message",
			text: "Finding the current repo…"
		};
		case "Failed": return {
			_tag: "Message",
			text: `Couldn't find the current repo: ${current.reason}`
		};
	}
};
const bodyOf = (snapshot, places) => {
	const { show } = snapshot.view;
	if (show === "current") return currentBody(snapshot, places);
	if (snapshot.repos.length === 0) return {
		_tag: "Message",
		text: emptyText(snapshot)
	};
	return show === "repos" ? treeBody(snapshot, places) : flatBody(snapshot, places, show);
};
/** Machines in the filter's order: this machine first, then the others by name. */
const byMachine = (a, b) => a === b ? 0 : a === null ? -1 : b === null ? 1 : a.localeCompare(b);
/**
* The machine filter's choices: All, then every machine a repo or a group folder is on.
* None while there is only one machine, as there is nothing to filter.
*/
const machineFilterOf = (snapshot) => {
	const machines = machinesOf(snapshot);
	const selected = selectedMachine(snapshot);
	if (machines.length < 2) return [];
	return [{
		label: "All",
		machine: none(),
		selected: isNone(selected)
	}, ...machines.map((machine) => ({
		label: machineName(machine),
		machine: some(machine),
		selected: contains(selected, machine)
	}))];
};
/** The one line for a machine that can't be read now. */
const machineLine = (machine, status) => status._tag === "Connecting" ? `${machineName(machine)}: connecting…` : `Can't reach ${machineName(machine)}: ${status.reason}`;
/** Everything the panel draws for `snapshot`. */
const buildView = (whole) => {
	const snapshot = {
		...whole,
		repos: reposOnMachine(whole).filter((repo) => !whole.machines.has(repo.machine))
	};
	const places = spacePlaces(snapshot.spaces, snapshot.panes);
	return {
		spinnerTip: snapshot.loading ? some("Refreshing worktrees") : none(),
		machineFilter: machineFilterOf(whole),
		chips: chipsOf(snapshot),
		views: SHOWS.map(([show, label]) => ({
			show,
			label,
			selected: show === snapshot.view.show
		})),
		toggle: snapshot.view.show === "repos" ? some(snapshot.view.only) : none(),
		banners: [
			...toArray(map$3(snapshot.settingsError, (error) => `${error} — using defaults until it's fixed.`)),
			...toArray(map$3(snapshot.discoverError, (error) => `Couldn't look for repos: ${error}`)),
			...snapshot.missingFolders.map((folder) => `Group folder ${folder} doesn't exist, so it lists no repos.`),
			...Array.from(snapshot.machines, ([machine, status]) => machineLine(machine, status))
		],
		body: bodyOf(snapshot, places)
	};
};

// src/wire.ts
const writeViewState = (state) => ({
	group: getOrNull(state.group),
	show: state.show,
	only: state.only,
	machine: match$5(state.machine, {
		onNone: () => null,
		onSome: (name) => ({ name })
	})
});
const readShow = (value) => fromNullishOr(SHOWS.find(([show]) => show === value)?.[0]);
/** A stored machine filter; anything but `{ name }` with a text or null name is All. */
const readMachineFilter = (value) => {
	const { name } = fields(value);
	return name === null || isString(name) ? some(name) : none();
};
/** The view state kept in shared state; anything missing or unreadable is the default. */
const readViewState = (value) => {
	const { group, show, only, machine } = fields(value);
	return {
		group: text(group),
		show: getOrElse$1(readShow(show), () => DEFAULT_VIEW_STATE.show),
		only: isBoolean(only) ? only : DEFAULT_VIEW_STATE.only,
		machine: readMachineFilter(machine)
	};
};
/** The folded repos and groups record; entries that aren't true or false are left out. */
const readFolded = (value) => Object.fromEntries(Object.entries(fields(value)).flatMap(([key, folded]) => isBoolean(folded) ? [[key, folded]] : []));
const oneOf = (options) => (value) => fromNullishOr(options.find((option) => option === value));
const readMode = oneOf(["squash", "keep"]);
const readAct = oneOf(SPACE_ACTS);
const readDialogMode = oneOf(["new", "open"]);
/** The machine a value names; no machine named is this machine. */
const readMachine = (value) => getOrNull(text(value));
/** A folder, and the machine it is on. */
const readLocated = (value) => {
	const f = fields(value);
	return map$3(text(f.folder), (folder) => ({
		machine: readMachine(f.machine),
		folder
	}));
};
/** A repo: its main checkout's folder, and the machine it is on. */
const readRepoId = (value) => {
	const f = fields(value);
	return map$3(text(f.root), (root) => ({
		machine: readMachine(f.machine),
		root
	}));
};
const readClick = (value) => {
	const f = fields(value);
	switch (f._tag) {
		case "Select": return map$3(text(f.space), (space) => ({
			_tag: "Select",
			space
		}));
		case "New": return map$3(all$2({
			name: text(f.name),
			folder: text(f.folder)
		}), (click) => ({
			_tag: "New",
			...click,
			machine: readMachine(f.machine)
		}));
		default: return none();
	}
};
const readLinked = (value) => {
	const f = fields(value);
	return map$3(all$2({
		main: text(f.main),
		path: text(f.path),
		branch: text(f.branch)
	}), (linked) => ({
		machine: readMachine(f.machine),
		...linked
	}));
};
const readBatch = (value) => {
	const f = fields(value);
	return map$3(all$2({
		main: text(f.main),
		branches: listOf$2(f.branches, text),
		paths: listOf$2(f.paths, text)
	}), (batch) => ({
		machine: readMachine(f.machine),
		...batch
	}));
};
/** An Action, as `send` posts it or a menu item carries it; none for anything else. */
const readAction = (value) => {
	const f = fields(value);
	switch (f._tag) {
		case "Open": return map$3(readClick(f.click), (click) => ({
			_tag: "Open",
			click
		}));
		case "Merge": return map$3(all$2({
			target: readLinked(f.target),
			mode: readMode(f.mode),
			dirty: bool(f.dirty)
		}), (merge) => ({
			_tag: "Merge",
			...merge
		}));
		case "Remove": return map$3(all$2({
			target: readLinked(f.target),
			dirty: bool(f.dirty)
		}), (remove) => ({
			_tag: "Remove",
			...remove
		}));
		case "Cleanup": return map$3(all$2({
			batches: listOf$2(f.batches, readBatch),
			dirty: finite(f.dirty)
		}), (cleanup) => ({
			_tag: "Cleanup",
			...cleanup
		}));
		case "SpaceWorktree": return map$3(all$2({
			space: text(f.space),
			act: readAct(f.act)
		}), (request) => ({
			_tag: "SpaceWorktree",
			...request
		}));
		case "NewOrOpen": return map$3(textOrNull(f.folder), (folder) => ({
			_tag: "NewOrOpen",
			folder
		}));
		case "GoTo": return map$3(all$2({
			folder: text(f.folder),
			name: text(f.name)
		}), (go) => ({
			_tag: "GoTo",
			...go,
			machine: readMachine(f.machine)
		}));
		case "NewOrOpenAt": return map$3(readLocated(f.at), (at) => ({
			_tag: "NewOrOpenAt",
			at
		}));
		case "Create": return map$3(all$2({
			main: text(f.main),
			name: text(f.name),
			base: textOrNull(f.base)
		}), (create) => ({
			_tag: "Create",
			...create,
			machine: readMachine(f.machine)
		}));
		case "CopyPath": return map$3(text(f.path), (path) => ({
			_tag: "CopyPath",
			path
		}));
		case "Reveal": return map$3(text(f.path), (path) => ({
			_tag: "Reveal",
			path
		}));
		case "Hide": return map$3(all$2({
			machine: textOrNull(f.machine),
			root: text(f.root)
		}), (repo) => ({
			_tag: "Hide",
			...repo
		}));
		case "Refresh": return some({ _tag: "Refresh" });
		case "Settings": return some({ _tag: "Settings" });
		case "Focus": return some({ _tag: "Focus" });
		case "PickMachine": return f.machine === null ? some({
			_tag: "PickMachine",
			machine: null
		}) : map$3(readMachineFilter(f.machine), (name) => ({
			_tag: "PickMachine",
			machine: { name }
		}));
		case "PickGroup": return map$3(textOrNull(f.group), (group) => ({
			_tag: "PickGroup",
			group
		}));
		default: return none();
	}
};
/** The mailbox's request; none when it holds nothing the panel can run. */
const readRequest = (value) => {
	const f = fields(value);
	return all$2({
		id: finite(f.id),
		action: readAction(f.action)
	});
};
/** The overlay id Herdr adds to an overlay's props; none for a layout block. */
const overlayOf = (props) => text(fields(props).overlay);
const readMenuItem = (value) => {
	const f = fields(value);
	return all$2({
		label: text(f.label),
		danger: bool(f.danger),
		checked: bool(f.checked),
		action: readAction(f.action)
	});
};
/** A menu's props read back; an item that can't be read is left out. */
const readMenuProps = (props) => {
	const f = fields(props);
	return {
		title: getOrElse$1(text(f.title), () => ""),
		items: Array.isArray(f.items) ? f.items.flatMap((item) => toArray(readMenuItem(item))) : []
	};
};
/**
* The confirm dialog's question, from the Action in its props: the text is worked out
* again from the Action, so it always matches what runs. None when there is no Action
* that needs asking.
*/
const readConfirmProps = (props) => flatMap$3(readAction(fields(props).action), (action) => map$3(confirmFor(action), (confirm) => ({
	confirm,
	action
})));
const readTitlebarProps = (props) => {
	const f = fields(props);
	return {
		title: getOrElse$1(text(f.title), () => "Worktrunk"),
		addr: text(f.addr)
	};
};
/** The New-or-open dialog's props read back; anything missing or mistyped is none. */
const readDialogProps = (props) => {
	const f = fields(props);
	return {
		mode: getOrElse$1(readDialogMode(f.mode), () => "new"),
		repo: readRepoId(f.repo),
		branch: text(f.branch),
		repos: Array.isArray(f.repos) ? f.repos.flatMap((repo) => toArray(readRepoId(repo))) : []
	};
};
/** A menu's props, for `openOverlay`; read back with `readMenuProps`. */
const menuProps = (title, items) => ({
	role: "menu",
	title,
	items
});
/** A confirm dialog's props: the Action it guards; read back with `readConfirmProps`. */
const confirmProps = (action) => ({
	role: "confirm",
	action
});
/** A job window title bar's props; read back with `readTitlebarProps`. */
const titlebarProps = (title, addr) => ({
	role: "titlebar",
	title,
	addr
});
/** The New-or-open dialog's props as plain JSON; read back with `readDialogProps`. */
const dialogProps = ({ mode, repo, branch, repos }) => ({
	role: "new",
	mode,
	repo: getOrNull(repo),
	branch: getOrNull(branch),
	repos
});
/** The settings file's text the Settings dialog opens on; null when there was no file. */
const readSettingsText = (props) => getOrNull(text(fields(props).text));
/** The Settings dialog's props: the file's text, null for none; read with `readSettingsText`. */
const settingsProps = (text) => ({
	role: "settings",
	text
});

// src/main.ts
const SETTINGS_FILE = `iangregsondev-worktrunk.json`;
/** The old third-party mod's settings, copied once into ours and never written. */
const LEGACY_FILE = "worktrunk.json";
/** True once the old mod's settings were imported, or a settings file made that moot. */
const IMPORTED_KEY = `iangregsondev-worktrunk.imported.v1`;
/** Folded repos and groups, remembered across restarts. */
const FOLDED_KEY = `iangregsondev-worktrunk.folded.v1`;
/** The machine filter, group filter, view and toggle, remembered across restarts. */
const VIEW_KEY = `iangregsondev-worktrunk.view.v1`;
/** The record `vp run herdr:sync` writes in Herdr's folder: the Herdr version it built from. */
const SYNC_RECORD = `iangregsondev-sync.json`;
/** The installed Herdr version the "run herdr:sync" toast was last shown for. */
const SYNC_TOLD_KEY = `iangregsondev-worktrunk.sync-told.v1`;
/** The mailbox: overlays (menus, dialogs) post an Action here for the panel to run. */
const REQUEST_KEY = requestKey("iangregsondev-worktrunk");
/** Each space's group, by space id, for the menus mod's sidebar labels. */
const GROUPS_KEY = groupsKey("iangregsondev-worktrunk");
/** The job window's key, so a new job's window takes the old one's place. */
const JOB_WINDOW = `iangregsondev-worktrunk-job`;
const LIST_EVERY = 2e4;
const SCAN_EVERY = 6e5;
const CI_EVERY = 3e5;
/**
* How many repos' CI is read at once. Each read spawns processes, and Herdr runs out of
* open files when every repo's start together. Lists need no limit: each machine's are
* read in one batched run.
*/
const CI_LIMIT = 3;
/** Herdr's API, as the services call it. */
const services = mergeAll(Shell.layer({
	exec,
	hc
}), Files.layer({
	readTextFile,
	writeTextFile,
	pickFolder,
	exec
}));
/**
* Runs a program at the edge. The programs never fail (load.ts turns every failure into
* a value), so only a defect, a bug, is left: it becomes `onDefect`'s value, which the
* panel shows like any other failure.
*/
const runEdge = (program, onDefect) => runPromiseExit(program.pipe(provide(services))).then(match$1({
	onSuccess: (value) => value,
	onFailure: (cause) => onDefect(pretty(cause))
}));
const fontSizes = () => {
	const base = Number(settings().ui_font_size) || 13;
	return {
		title: base + 1,
		body: base + .5,
		small: base - .5,
		label: base - 1
	};
};
const icon = (name, size, color) => svg(`mods/iangregsondev-worktrunk/${name}.svg`).size(size).flex_none().text_color(color);
/** `el` with a hover label, announced the same way to a screen reader. */
const labelled = (el, text) => el.tooltip(text).accessibility_label(text);
const dot = (color, size, hollow) => hollow ? div().w(size).h(size).flex_none().rounded_full().border(1.5).border_color(color) : div().w(size).h(size).flex_none().rounded_full().bg(color);
const BUTTON_COLORS = {
	plain: (t) => [t.raised, t.foreground],
	accent: (t) => [t.accent, t.accent_foreground],
	danger: (t) => [t.ansi1, t.solid_foreground]
};
/** The dialogs' text buttons. */
const button = (t, id, label, tone, onClick) => {
	const [bg, fg] = BUTTON_COLORS[tone](t);
	return div().id(id).flex_none().px(14).py(5).rounded(6).cursor_pointer().bg(bg).text_color(fg).when(tone === "plain", (el) => el.hover((s) => s.bg(t.hover))).on_click(onClick).child(label);
};
const toneColor = (t, tone) => ({
	main: t.accent,
	merged: t.done,
	active: t.working,
	conflict: t.blocked
})[tone];
const onClickRow = (click) => {
	const { command, args } = clickCommand(click);
	run(command, args);
};
const toggleFold = (key) => {
	const folded = readFolded(shared(FOLDED_KEY));
	setShared(FOLDED_KEY, {
		...folded,
		[key]: !folded[key]
	});
};
/**
* Shows a refresh read's defect, a bug left after each answer's own is kept (one in the
* code that keeps the answers), as a toast: the read never stops silently.
*/
const showDefect = (what) => (body) => notify({
	title: `Couldn't read ${what}`,
	body,
	level: "error"
});
/**
* Reads `read` for every repo's folder, a few at a time, handing each answer to `keep`
* under the repo's `repoKey`.
*/
const readAll = (repos, limit, read, keep) => runEdge(readEach(repos, limit, (repo) => defectAsReason(read(repo)), (repo, answer) => keep(repoKey(repo), answer)), showDefect("CI"));
const viewState = () => readViewState(shared(VIEW_KEY));
const setView = (change) => setShared(VIEW_KEY, writeViewState({
	...viewState(),
	...change
}));
const ciIcon = (t, badge) => {
	switch (badge.status) {
		case "passed": return ["check", t.done];
		case "running": return ["ring", t.working];
		case "failed": return ["alert", t.ansi1];
		case "conflicts": return ["alert", t.blocked];
		case "unknown": return ["help", t.muted];
	}
};
/** One warning toast for each thing that went wrong around the job `title`. */
const jobProblems = (title, problems) => problems.forEach((body) => notify({
	title,
	body,
	level: "warning"
}));
/** Defers work out of `render`, which may not notify. */
const later = (cx, fn) => cx.spawn(async (cx) => {
	await cx.sleep(0);
	fn(cx);
});
/**
* Shows one toast when Herdr has moved past the version the sync record names, or says
* the record couldn't be read (not marked as told, so a readable record still toasts).
*/
const checkSync = async () => {
	const installed = updates().app.version;
	const toast = await runEdge(syncToast(`${appHome()}/${SYNC_RECORD}`, installed, shared(SYNC_TOLD_KEY)), fail$2);
	match$4(toast, {
		onFailure: (body) => notify({
			title: "Couldn't check for herdr:sync",
			body,
			level: "warning"
		}),
		onSuccess: map$3((notice) => {
			setShared(SYNC_TOLD_KEY, installed);
			notify({
				...notice,
				level: "warning"
			});
		})
	});
};
/** This copy's props: the layout block's or the overlay's, `overlay` added for an overlay. */
const ownProps = () => props();
/** The request in the mailbox, if it holds one the panel can run. */
const mailbox = () => readRequest(shared(REQUEST_KEY));
/** Hands `action` to the panel; an overlay's own tasks end when it closes. */
const send = (action) => setShared(REQUEST_KEY, {
	id: Date.now() + Math.random(),
	action
});
/** Runs `action` through the panel, after asking first when it removes or merges. */
const ask = (action) => match$5(confirmFor(action), {
	onNone: () => send(action),
	onSome: ({ lines }) => openOverlay({
		mod: "iangregsondev-worktrunk",
		kind: "dialog",
		width: 500,
		height: dialogHeight(lines.length),
		props: confirmProps(action)
	})
});
/** A right-click menu; its height comes from its items. */
const openMenu = (title, items) => openOverlay({
	mod: "iangregsondev-worktrunk",
	kind: "popup",
	width: 250,
	height: menuHeight(items.length),
	props: menuProps(title, items)
});
/** Closes this copy's own overlay. */
const closeSelf = () => map$3(overlayOf(ownProps()), closeOverlay);
const settingsFile = () => ({
	path: `${appHome()}/${SETTINGS_FILE}`,
	name: SETTINGS_FILE
});
/** The New-or-open dialog's size; its list scrolls. */
const NEW_WIDTH = 540;
const NEW_HEIGHT = 440;
/** The Settings dialog's size; its body scrolls when the lists outgrow it. */
const SETTINGS_WIDTH = 620;
const SETTINGS_HEIGHT = 600;
/** Shows the job's terminal in a floating window, under a title bar with a Stop button. */
const openJobWindow = (title, addr) => openOverlay({
	kind: "window",
	key: JOB_WINDOW,
	width: 820,
	height: 460,
	layout: {
		type: "column",
		children: [{
			type: "block",
			size: { px: 34 },
			content: {
				mod: "iangregsondev-worktrunk",
				props: titlebarProps(title, addr)
			}
		}, {
			type: "block",
			content: { terminal: addr }
		}]
	}
});
/** The panel's block is shown; a copy with no block of its own (an overlay) counts as shown. */
const shown = () => match$5(findModBlock(layout(), "iangregsondev-worktrunk"), {
	onNone: () => true,
	onSome: (block) => !block.hidden
});
var Worktrunk = class extends View {
	copy = { _tag: "Panel" };
	settings = DEFAULT_SETTINGS;
	settingsError = none();
	/** The last folder scan's repos and missing group folders; `lastScan` says what and when. */
	scanned = none();
	/** Each machine's latest search, which the repos are found from. */
	searches = /* @__PURE__ */ new Map();
	/** The machines whose refresh is still running: a new refresh runs nothing there. */
	refreshing = /* @__PURE__ */ new Set();
	lastScan = none();
	repos = [];
	discovered = false;
	discoverError = none();
	lists = /* @__PURE__ */ new Map();
	/** Worktree paths dropped from their lists, waiting for a folder check on their machine. */
	orphans = NO_ORPHANS;
	/** The machines whose dropped paths' folder check is running. */
	orphanChecks = /* @__PURE__ */ new Set();
	/** The machines that can't be read now, and why; their repos aren't listed or read. */
	machineStatus = /* @__PURE__ */ new Map();
	loader = IDLE;
	reads = NO_READS;
	ci = /* @__PURE__ */ new Map();
	/** When the last CI read started; none makes the next refresh read CI too. */
	ciAt = none();
	checking = false;
	search = "";
	searchBox = none();
	/** The last mailbox request seen, so each runs once. */
	handled = none();
	/** The running job's title; one job at a time. */
	job = none();
	/** An overlay's keyboard. */
	handle = none();
	/** The Current view following focus: the folder last looked up, and its repo. */
	follow = NOT_FOLLOWING;
	init(_props, cx) {
		const role = roleOf(ownProps());
		if (isNone(role)) {
			this.copy = { _tag: "Unknown" };
			return;
		}
		if (role.value === "toggle") {
			this.copy = { _tag: "Toggle" };
			return this.listenForCommands(cx);
		}
		if (role.value !== "panel") return this.initOverlay(cx, role.value);
		this.handled = handledAtStart(mailbox(), Date.now());
		this.listenForCommands(cx);
		const box = InputState.new({ placeholder: "Branch or repo" });
		box.on("change", (_event, cx) => {
			this.search = box.value();
			cx.notify();
		});
		this.searchBox = some(box);
		cx.spawn(checkSync);
		cx.timer.every(LIST_EVERY, (cx) => {
			if (shown() && isNone(this.job)) this.refresh(cx, { scan: false });
		});
	}
	/** Acts on `keys.json` commands (`iangregsondev-worktrunk.<command>`) sent to this copy. */
	listenForCommands(cx) {
		cx.spawn(async (cx) => {
			for (;;) {
				const command = await nextCommand();
				this.onCommand(cx, command);
				cx.notify();
			}
		});
	}
	/** Does what `routeCommand` says this copy does with `command`. */
	onCommand(cx, command) {
		const role = this.copy._tag === "Toggle" ? "toggle" : "panel";
		const step = routeCommand(command, role, copiesIn(layout(), "iangregsondev-worktrunk"));
		switch (step._tag) {
			case "Run": return this.perform(cx, actionFor(step.command));
			case "ShowThen":
				run("layout.show", { id: step.id });
				return send(actionFor(step.command));
			case "Toggle":
				run("layout.toggle", { id: step.id });
				return;
			default: map$3(noticeFor(step), (notice) => notify({
				...notice,
				level: "warning"
			}));
		}
	}
	/**
	* Opens the worktree dialog in `mode` for the repo `folder` is in, on its machine (none:
	* the focused folder), offering the branch that folder is on as a base. Outside every
	* repo, the dialog asks for one of the repos the panel lists, on any machine.
	*/
	openNewOrOpen(cx, folder, mode = "new") {
		const places = spacePlaces(spaces(), panes());
		const at = getOrElse$1(folder, () => focusedOrHere(focused(), places));
		const listed = this.repos.map(({ machine, root }) => ({
			machine,
			root
		}));
		cx.spawn(async () => {
			const opened = await runEdge(dialogFor(at, listed, mode), fail$2);
			match$4(opened, {
				onSuccess: (props) => match$5(props, {
					onNone: () => notify({
						title: "No repo for a worktree",
						body: "Focus a terminal in a repo, or add your repo folders in Settings.",
						level: "warning"
					}),
					onSome: (props) => openOverlay({
						mod: "iangregsondev-worktrunk",
						kind: "dialog",
						width: NEW_WIDTH,
						height: NEW_HEIGHT,
						props: dialogProps(props)
					})
				}),
				onFailure: (body) => notify({
					title: "Couldn't find the repo for a worktree",
					body,
					level: "warning"
				})
			});
		});
	}
	/** An overlay takes the keyboard, and keeps the state only its role needs. */
	initOverlay(cx, role) {
		const handle = cx.focus_handle();
		handle.focus();
		this.handle = some(handle);
		switch (role) {
			case "menu":
				this.copy = {
					_tag: "Menu",
					menu: { selected: 0 }
				};
				return;
			case "confirm":
				this.copy = { _tag: "Confirm" };
				return;
			case "titlebar":
				this.copy = { _tag: "Titlebar" };
				return;
			case "settings":
				this.copy = {
					_tag: "Settings",
					draft: this.initSettings()
				};
				return;
			case "new": {
				const state = openDialog(readDialogProps(ownProps()));
				const dialog = {
					state,
					input: this.newInput(() => dialog, state)
				};
				this.copy = {
					_tag: "New",
					dialog
				};
				map$3(state.repo, (repo) => this.readDialogRepo(cx, dialog, repo));
				return;
			}
		}
	}
	/** A fresh, focused input for the dialog's step: a repo name while it asks for one, else a branch. */
	newInput(dialog, state) {
		const input = InputState.new({ placeholder: dialogCopy(state).placeholder });
		input.on("change", (_event, cx) => {
			dialog().state = retyped(dialog().state);
			cx.notify();
		});
		input.on("submit", (_event, cx) => {
			const { state, input } = dialog();
			const lines = linesFor(state, input.value());
			this.pickNew(cx, dialog(), fromNullishOr(lines[highlight(state, lines)]));
		});
		input.focus();
		return input;
	}
	/** Reads the worktrees and branches of `repo` into the dialog's list. */
	readDialogRepo(cx, dialog, repo) {
		cx.spawn(async (cx) => {
			const read = await runEdge(readDialogRepo(repo), (defect) => ({
				list: fail$2(defect),
				branches: succeed$3([])
			}));
			dialog.state = withRead(dialog.state, read.list, read.branches);
			cx.notify();
		});
	}
	/** Enter or a click on a line: picks the repo, or hands the choice to the panel. */
	pickNew(cx, dialog, line) {
		const picked = pick(dialog.state, line);
		switch (picked._tag) {
			case "ReadRepo":
				dialog.state = picked.state;
				dialog.input = this.newInput(() => dialog, picked.state);
				this.readDialogRepo(cx, dialog, picked.repo);
				cx.notify();
				return;
			case "Send":
				closeSelf();
				send(picked.action);
				return;
			case "Nothing": return;
		}
	}
	/** The Settings dialog starts from the file's text the panel read when it opened it. */
	initSettings() {
		const opened = readSettingsText(ownProps());
		const parsed = parseSettings(opened, SETTINGS_FILE);
		const skip = InputState.new({ placeholder: "node_modules, .cache" });
		skip.set_value(skipText(parsed.settings.skip));
		const draft = {
			settings: parsed.settings,
			opened,
			broken: parsed.error,
			names: [],
			skip,
			machine: none(),
			typed: InputState.new({ placeholder: "~/code" }),
			checking: false,
			note: ""
		};
		this.nameFields(draft);
		return draft;
	}
	/** New name fields, one per folder, holding the draft's names. */
	nameFields(draft) {
		draft.names = draft.settings.folders.map((folder) => {
			const field = InputState.new({ placeholder: lastSegment(folder.path) });
			field.set_value(folder.name);
			return field;
		});
	}
	/** The draft's settings with what the fields hold now. */
	drafted(draft) {
		return withFields(draft.settings, {
			names: draft.names.map((field) => field.value()),
			skip: draft.skip.value(),
			depth: draft.settings.depth
		});
	}
	/** Applies `change` to the draft, keeping what the fields hold. */
	editDraft(draft, change) {
		const before = draft.settings.folders;
		draft.settings = change(this.drafted(draft));
		if (draft.settings.folders !== before) this.nameFields(draft);
	}
	/** Adds a group folder picked in the system's folder picker. */
	pickGroupFolder(cx, draft) {
		cx.spawn(async (cx) => {
			const picked = await runEdge(pickGroupFolder(), fail$2);
			match$4(picked, {
				onSuccess: (folder) => map$3(folder, (path) => this.editDraft(draft, (settings) => addFolder(settings, path, home()))),
				onFailure: (reason) => {
					draft.note = reason;
				}
			});
			cx.notify();
		});
	}
	/**
	* Adds the typed folder on the picked machine once a check there finds it. A folder
	* that isn't there, or a check that can't run, is the dialog's note; nothing is added.
	*/
	addTypedFolder(cx, draft, machine) {
		if (draft.checking) return;
		draft.checking = true;
		draft.note = "";
		const settings = this.drafted(draft);
		cx.spawn(async (cx) => {
			const added = await runEdge(addGroupFolderOn(settings, machine, draft.typed.value()), fail$2);
			draft.checking = false;
			match$4(added, {
				onSuccess: (next) => {
					this.editDraft(draft, () => next);
					draft.typed.set_value("");
				},
				onFailure: (reason) => {
					draft.note = reason;
				}
			});
			cx.notify();
		});
	}
	/**
	* Saves the draft, never over a hand edit made since the dialog opened; then the panel
	* reads everything again and the dialog closes. A save that didn't happen says why.
	*/
	saveSettings(cx, draft) {
		if (draft.checking) return;
		const settings = this.drafted(draft);
		cx.spawn(async (cx) => {
			const saved = await runEdge(saveSettings(settingsFile(), draft.opened, settings), fail$2);
			match$4(saved, {
				onSuccess: (done) => {
					if (done === "Saved") send({ _tag: "Refresh" });
					closeSelf();
				},
				onFailure: (reason) => {
					draft.note = reason;
					cx.notify();
				}
			});
		});
	}
	/** Runs a request from the mailbox. Jobs and the settings file are the panel's work. */
	perform(cx, action) {
		switch (action._tag) {
			case "Open": return onClickRow(action.click);
			case "CopyPath":
				cx.write_to_clipboard(action.path);
				notify({
					title: "Copied",
					body: action.path,
					level: "info",
					timeout: 2e3
				});
				return;
			case "Reveal":
				cx.spawn(async () => {
					const shown = await runEdge(reveal(action.path).pipe(match({
						onSuccess: () => none(),
						onFailure: (failed) => some(failureText(failed))
					})), some);
					map$3(shown, (body) => notify({
						title: "Couldn't reveal it in the Finder",
						body,
						level: "warning"
					}));
				});
				return;
			case "Refresh": return this.refreshWithCi(cx, { scan: true });
			case "Hide":
				cx.spawn(async (cx) => {
					const hid = await runEdge(hideInSettings(settingsFile(), {
						machine: action.machine,
						root: action.root
					}), fail$2);
					match$4(hid, {
						onSuccess: () => void 0,
						onFailure: (body) => notify({
							title: "Couldn't hide the repo",
							body,
							level: "warning"
						})
					});
					this.refresh(cx, { scan: false });
				});
				return;
			case "NewOrOpen": return this.openNewOrOpen(cx, map$3(fromNullishOr(action.folder), (folder) => ({
				machine: null,
				folder
			})));
			case "GoTo": return onClickRow(goTo(spacePlaces(spaces(), panes()), action));
			case "NewOrOpenAt": return this.openNewOrOpen(cx, some(action.at));
			case "SpaceWorktree": return this.forSpace(cx, action.space, action.act);
			case "Focus":
				map$3(this.searchBox, (box) => box.focus());
				return;
			case "PickMachine": return setView({ machine: map$3(fromNullishOr(action.machine), ({ name }) => name) });
			case "PickGroup": return setView({ group: fromNullishOr(action.group) });
			case "Create": return this.createWorktree(cx, action);
			case "Settings":
				cx.spawn(async () => {
					const text = await runEdge(settingsText(settingsFile()), fail$2);
					match$4(text, {
						onSuccess: (opened) => openOverlay({
							mod: "iangregsondev-worktrunk",
							kind: "dialog",
							modal: true,
							width: SETTINGS_WIDTH,
							height: SETTINGS_HEIGHT,
							props: settingsProps(opened)
						}),
						onFailure: (body) => notify({
							title: "Couldn't open Settings",
							body,
							level: "warning"
						})
					});
				});
				return;
			default: this.runJobs(cx, jobsFor(action, this.settings));
		}
	}
	/**
	* Acts on the worktree the space `space` sits on, as Herdr's space menu asks: the
	* New-or-open dialog for its repo, or a merge or remove of it, confirmed as from a row.
	*/
	forSpace(cx, space, act) {
		const warn = (body) => notify({
			title: "No worktree to act on",
			body,
			level: "warning"
		});
		const step = spaceStep(spacePlaces(spaces(), panes()), space, act);
		switch (step._tag) {
			case "NoFolder": return warn("That space has no folder.");
			case "Dialog": return this.openNewOrOpen(cx, some(step.at), step.mode);
			case "Act": cx.spawn(async () => {
				const asked = await runEdge(spaceWorktree(step.act, step.at), fail$2);
				match$4(asked, {
					onSuccess: ask,
					onFailure: warn
				});
			});
		}
	}
	/** Busy with another job: says so and gives true. */
	busy() {
		return match$5(this.job, {
			onNone: () => false,
			onSome: (running) => {
				notify({
					...busyNotice(running),
					level: "warning"
				});
				return true;
			}
		});
	}
	/**
	* What every job does once it has ended: say why it never started, or close the spaces
	* on its removed folders (on its machine) and say what went wrong around it. Those
	* folders never count as orphans' worktrees: their spaces are closed here.
	*/
	jobEnded(title, machine, outcome) {
		if (outcome._tag === "NotStarted") notify({
			title: `Couldn't start: ${title}`,
			body: outcome.reason,
			level: "error"
		});
		else {
			this.orphans = jobRemoved(this.orphans, machine, outcome.gone);
			spacesInGone(spaces(), panes(), machine, outcome.gone).forEach((id) => run("space.close", {
				id,
				confirmed: true
			}));
			jobProblems(title, outcome.problems);
		}
	}
	/**
	* Checks the worktree paths dropped on `machine` in one run there, unless none wait or
	* a check there is still running, then closes the orphan spaces on the gone ones where
	* only shells run. Spaces where something else runs get one toast each, never repeated,
	* that closes the space after Herdr's own confirm when clicked.
	*/
	checkOrphans(cx, machine) {
		const asked = waitingOn(this.orphans, machine);
		if (asked.length === 0 || this.orphanChecks.has(machine)) return;
		this.orphanChecks = /* @__PURE__ */ new Set([...this.orphanChecks, machine]);
		cx.spawn(async () => {
			const answer = await runEdge(checkGone(asked, machine), fail$2);
			this.orphanChecks = new Set([...this.orphanChecks].filter((at) => at !== machine));
			const after = checked(this.orphans, machine, asked, answer);
			const [all, open] = [spaces(), panes()];
			orphanSpaces(all, open, machine, after.gone).forEach((orphan) => {
				if (orphan.step === "Close") run("space.close", {
					id: orphan.space,
					confirmed: true
				});
			});
			const ask = askToasts(after.orphans, all, open, machine, after.gone);
			this.orphans = ask.orphans;
			ask.toasts.forEach((toast) => notify(toast));
		});
	}
	/** No job runs any more: the panel says so and reads the list again. */
	jobsDone(cx) {
		this.job = none();
		cx.notify();
		this.refresh(cx, { scan: false });
	}
	/**
	* Runs `specs` one after another as terminal jobs, each in a floating window on its
	* machine, one job at a time. A window closes when its job ends; a failed job waits
	* for Enter first, so it stays open with its exit code. After each, spaces on its
	* removed folders close; after the last, the list is read again.
	*/
	runJobs(cx, specs) {
		const [first] = specs;
		if (first === void 0 || this.busy()) return;
		this.job = some(first.title);
		cx.notify();
		cx.spawn(async (cx) => {
			for (const spec of specs) {
				this.job = some(spec.title);
				cx.notify();
				const outcome = await runEdge(runJob(spec, (addr) => openJobWindow(spec.title, addr)), (defect) => ({
					_tag: "NotStarted",
					reason: defect
				}));
				this.jobEnded(spec.title, spec.on, outcome);
			}
			this.jobsDone(cx);
		});
	}
	/**
	* Switches to or creates the worktree `create` asks for as a job on its repo's machine,
	* then opens a space on it there, or selects the one already there.
	*/
	createWorktree(cx, create) {
		if (this.busy()) return;
		const title = `Open or create ${create.name}`;
		this.job = some(title);
		cx.notify();
		cx.spawn(async (cx) => {
			const made = await runEdge(newWorktree(create, (addr) => openJobWindow(title, addr)), (defect) => ({
				outcome: {
					_tag: "NotStarted",
					reason: defect
				},
				switched: none(),
				problems: []
			}));
			jobProblems(title, made.problems);
			map$3(made.switched, ({ branch, path }) => onClickRow(goTo(spacePlaces(spaces(), panes()), {
				machine: create.machine,
				folder: path,
				name: branch
			})));
			this.jobEnded(title, create.machine, made.outcome);
			this.jobsDone(cx);
		});
	}
	/** The repos the view shows: the only ones worth reading. */
	reposToRead() {
		return reposToRead({
			repos: this.repos,
			discovered: this.discovered,
			settings: this.settings,
			view: viewState(),
			current: this.currentRepo(),
			machines: this.machineStatus
		});
	}
	/** The Current repo, with its group; Looking while it is first being looked up. */
	currentRepo() {
		return currentRepoOf(this.follow.found, this.repos, this.settings.folders, match$5(this.scanned, {
			onNone: () => /* @__PURE__ */ new Map([[null, home()]]),
			onSome: (scanned) => scanned.homes
		}));
	}
	/**
	* While the Current view shows, looks up the focused folder's repo whenever the folder
	* changes. Herdr renders on every focus change, so this never polls.
	*/
	followFocus(cx, following) {
		const places = spacePlaces(spaces(), panes());
		const folder = focusedOrHere(focused(), places);
		const step = followFocus(this.follow, {
			following,
			folder
		});
		this.follow = step.follow;
		map$3(step.lookUp, (folder) => later(cx, (cx) => this.lookUpCurrent(cx, folder)));
	}
	/** Looks up the repo of `folder`, on its machine; a new Current repo is read at once. */
	lookUpCurrent(cx, folder) {
		cx.spawn(async (cx) => {
			const answer = await runEdge(lookUpCurrent(folder), fail$2);
			const taken = takeLookup(this.follow, folder, answer);
			this.follow = taken.follow;
			cx.notify();
			if (taken.refresh) this.refresh(cx, { scan: false });
		});
	}
	/** CI for the repos shown, from `wt list --full`. A failed read keeps the CI from before. */
	checkCi(cx) {
		if (this.checking || !this.discovered) return;
		this.checking = true;
		this.ciAt = some(Date.now());
		cx.spawn(async (cx) => {
			await readAll(this.reposToRead(), CI_LIMIT, readCi, (key, read) => {
				const old = fromNullishOr(this.ci.get(key));
				this.ci = new Map([...this.ci, [key, foldCi(old, read)]]);
				cx.notify();
			});
			this.checking = false;
		});
	}
	refresh(cx, ask) {
		const asked = askRefresh(this.loader, ask);
		this.loader = asked.loader;
		cx.notify();
		if (isNone(asked.start)) return;
		const start = asked.start.value;
		cx.spawn(async (cx) => {
			await this.load(cx, start);
			const done = refreshDone(this.loader);
			this.loader = done.loader;
			cx.notify();
			if (ciDue(this.ciAt, {
				now: Date.now(),
				every: CI_EVERY
			})) this.checkCi(cx);
			if (isSome(done.again)) this.refresh(cx, done.again.value);
		});
	}
	/**
	* One refresh: the settings, then each machine's repos and its shown repos' worktrees,
	* the machines side by side. It ends when this machine's part does.
	*/
	async load(cx, { scan }) {
		const settled = shared(IMPORTED_KEY) === true;
		const loaded = await runEdge(loadSettings({
			path: `${appHome()}/${SETTINGS_FILE}`,
			name: SETTINGS_FILE,
			legacyPath: `${appHome()}/${LEGACY_FILE}`
		}, settled), (defect) => ({
			parsed: {
				settings: DEFAULT_SETTINGS,
				error: some(`${SETTINGS_FILE}: ${defect}`)
			},
			settled,
			leftover: none()
		}));
		if (loaded.settled && !settled) setShared(IMPORTED_KEY, true);
		map$3(loaded.leftover, (body) => notify({
			title: "Old settings file left behind",
			body,
			level: "warning"
		}));
		this.settings = loaded.parsed.settings;
		this.settingsError = loaded.parsed.error;
		const now = Date.now();
		const key = scanKey(this.settings);
		const due = scanDue(this.lastScan, {
			forced: scan,
			key,
			now,
			every: SCAN_EVERY
		});
		const places = spacePlaces(spaces(), panes()).map((p) => ({
			machine: p.machine,
			folder: p.place
		}));
		const current = flatten$1(flatMap$3(this.follow.found, getSuccess));
		const ask = {
			settings: this.settings,
			home: home(),
			places,
			last: this.searches,
			rescan: due,
			states: machineStates(machines()),
			busy: this.refreshing
		};
		const started = machinesOf$1(this.settings, places).filter((machine) => !this.refreshing.has(machine));
		this.refreshing = /* @__PURE__ */ new Set([...this.refreshing, ...started]);
		await new Promise((done) => {
			if (!started.includes(null)) done();
			cx.spawn(async (cx) => {
				await runEdge(refreshMachines(ask, (machine, search) => {
					const landed = landSearch({
						searches: this.searches,
						error: this.discoverError,
						statuses: this.machineStatus
					}, machine, search);
					this.searches = landed.searches;
					this.discoverError = landed.error;
					this.machineStatus = landed.statuses;
					if (due && machine === null && isSuccess(search)) this.lastScan = some({
						key,
						at: now
					});
					const found = foundOf(this.settings, ask.home, places, this.searches, current);
					this.repos = found.repos;
					this.scanned = some(found.scanned);
					this.discovered = true;
					cx.notify();
					return this.reposToRead();
				}, (machine, answer) => {
					this.orphans = listsRead(this.orphans, this.lists, machine, answer);
					this.checkOrphans(cx, machine);
					const kept = keepLists({
						lists: this.lists,
						machines: this.machineStatus
					}, machine, answer);
					this.lists = kept.lists;
					this.machineStatus = kept.machines;
					cx.notify();
				}, (machine) => {
					this.refreshing = new Set([...this.refreshing].filter((at) => at !== machine));
					if (machine === null) done();
				}), showDefect("the repos"));
				this.discovered = true;
				cx.notify();
				done();
			});
		});
	}
	/** Reads CI again with the next refresh, which `ask` starts. */
	refreshWithCi(cx, ask) {
		this.ciAt = none();
		this.refresh(cx, ask);
	}
	/**
	* Publishes each space's group, on every machine, for the sidebar's labels. Only once
	* repos are found, so a start doesn't clear the labels, and only when it changed: every
	* mod renders again on a shared-state change.
	*/
	publishGroups() {
		if (!this.discovered) return;
		const groups = spaceGroups(spacePlaces(spaces(), panes()), this.repos, this.lists);
		if (groupsChanged(groups, shared(GROUPS_KEY))) setShared(GROUPS_KEY, groups);
	}
	render(cx) {
		const style = {
			t: theme(),
			sizes: fontSizes()
		};
		const copy = this.copy;
		if (copy._tag === "Toggle") return this.renderToggle(style);
		if (copy._tag === "Unknown") return div();
		if (copy._tag !== "Panel") return this.renderOverlay(style, copy);
		const { t, sizes } = style;
		map$3(filter(mailbox(), (request) => !contains(this.handled, request.id)), (request) => {
			this.handled = some(request.id);
			later(cx, (cx) => this.perform(cx, request.action));
		});
		const block = findModBlock(layout(), "iangregsondev-worktrunk");
		const state = viewState();
		const group = getOrElse$1(state.group, () => "");
		const rendered = onRender(this.reads, {
			shown: shown(),
			group
		});
		this.reads = rendered.reads;
		if (rendered.step === "Start") later(cx, (cx) => this.refresh(cx, { scan: false }));
		if (rendered.step === "NewGroup") later(cx, (cx) => this.refreshWithCi(cx, { scan: false }));
		this.followFocus(cx, shown() && state.show === "current");
		this.publishGroups();
		const view = buildView({
			repos: this.repos,
			discovered: this.discovered,
			loading: this.loader._tag === "Loading",
			lists: this.lists,
			settings: this.settings,
			settingsError: this.settingsError,
			discoverError: this.discoverError,
			missingFolders: match$5(this.scanned, {
				onNone: () => [],
				onSome: (scan) => scan.missing
			}),
			machines: this.machineStatus,
			settingsFile: SETTINGS_FILE,
			spaces: spaces(),
			panes: panes(),
			folded: readFolded(shared(FOLDED_KEY)),
			ci: this.ci,
			view: state,
			search: this.search,
			current: this.currentRepo(),
			now: Date.now()
		});
		const iconButton = (id, name, onClick) => h_flex().id(id).size(24).justify_center().items_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_event, cx) => onClick(cx)).child(icon(name, 14, t.muted));
		const header = h_flex().h(42).flex_none().pl(14).pr(8).gap(6).items_center().border_b(1).border_color(t.border).child(icon("git", 16, t.accent)).child(div().flex_1().text_size(sizes.title).font_semibold().child("Worktrunk")).children(toArray(view.spinnerTip).map((tip) => labelled(div().flex_none().child(icon("ring", 13, t.muted).spin(900)), tip))).child(iconButton("new", "plus", () => send({
			_tag: "NewOrOpen",
			folder: null
		}))).child(iconButton("settings", "settings", () => send({ _tag: "Settings" }))).child(iconButton("refresh", "sync", (cx) => later(cx, (cx) => this.refreshWithCi(cx, { scan: true })))).when(isSome(block), (el) => el.child(iconButton("close", "close", () => map$3(block, (b) => run("layout.hide", { id: b.id })))));
		return v_flex().id("worktrunk").size_full().min_h(0).overflow_hidden().bg(t.background).text_color(t.foreground).text_size(sizes.body).child(header).children(view.banners.map((text) => div().px(12).py(6).bg(t.selected).text_size(sizes.label).text_color(t.blocked).child(text))).child(this.renderControls(style, view)).child(div().id("list").flex_1().min_h(0).overflow_y_scrollbar().child(this.renderBody(style, view.body))).children(this.renderFooter(style));
	}
	/** The worktrees of the repo kept under `key` (its `repoKey`). */
	worktreesOf(key) {
		return match$5(fromNullishOr(this.lists.get(key)), {
			onNone: () => [],
			onSome: (list) => list.worktrees
		});
	}
	/** "Running: <job>" while a job runs. */
	renderFooter({ t, sizes }) {
		return toArray(this.job).map((title) => h_flex().id("footer").h(36).flex_none().px(12).gap(8).items_center().border_t(1).border_color(t.border).text_size(sizes.label).child(icon("ring", 13, t.working).spin(900)).child(div().min_w(0).truncate().text_color(t.muted).child(`Running: ${title}`)));
	}
	openRowMenu(row) {
		map$3(findWorktree(this.lists, row.key), ({ machine, root, worktree }) => openMenu(row.label, rowMenu({
			machine,
			root
		}, worktree, row.click)));
	}
	/** The menu of the repo kept under `key` (its `repoKey`). */
	openRepoMenu(key) {
		const repo = repoOfKey(key);
		openMenu(lastSegment(repo.root), repoMenu(repo, this.worktreesOf(key)));
	}
	renderOverlay(style, copy) {
		const p = ownProps();
		switch (copy._tag) {
			case "Titlebar": return this.renderTitlebar(style, readTitlebarProps(p));
			case "Confirm": return match$5(readConfirmProps(p), {
				onNone: () => div(),
				onSome: (asked) => this.renderConfirm(style, asked)
			});
			case "New": return this.renderNew(style, copy.dialog);
			case "Menu": return this.renderMenu(style, readMenuProps(p), copy.menu);
			case "Settings": return this.renderSettings(style, copy.draft);
		}
	}
	/** The overlay's root takes the keyboard its handle was given. */
	focused(el) {
		return match$5(this.handle, {
			onNone: () => el,
			onSome: (h) => el.track_focus(h)
		});
	}
	renderMenu({ t, sizes }, { title, items }, menu) {
		const choose = (item) => map$3(fromNullishOr(item), (chosen) => {
			closeSelf();
			ask(chosen.action);
		});
		return this.focused(v_flex().id("menu").size_full().p(6).bg(t.popover).text_color(t.foreground).text_size(sizes.body).on_key_down((e, cx) => {
			if (e.key === "down" || e.key === "up") {
				const step = e.key === "down" ? 1 : items.length - 1;
				menu.selected = (menu.selected + step) % Math.max(1, items.length);
				cx.notify();
			} else if (e.key === "enter") choose(items[menu.selected]);
			else if (e.key === "escape") closeSelf();
		}).child(div().h(28).px(8).flex().items_center().truncate().text_size(sizes.label).text_color(t.muted).child(title)).children(items.map((item, i) => h_flex().id(`item-${i}`).h(30).flex_none().px(8).items_center().rounded(6).cursor_pointer().text_color(item.danger ? t.ansi1 : t.foreground).when(i === menu.selected, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover)).on_click(() => choose(item)).child(div().flex_1().min_w(0).truncate().child(item.label)).when(item.checked, (el) => el.child(icon("check", 13, t.accent))))));
	}
	renderConfirm({ t, sizes }, { confirm, action }) {
		const go = () => {
			closeSelf();
			send(action);
		};
		return this.focused(v_flex().id("confirm").size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(sizes.body).on_key_down((e) => {
			if (e.key === "enter") go();
			else if (e.key === "escape") closeSelf();
		}).child(div().text_size(sizes.title).font_semibold().child(confirm.title)).child(v_flex().flex_1().min_h(0).gap(4).text_color(t.muted).children(confirm.lines.map((line) => div().child(line)))).child(h_flex().justify_end().gap(8).child(button(t, "cancel", "Cancel", "plain", closeSelf)).child(button(t, "go", confirm.go, confirm.danger ? "danger" : "accent", go))));
	}
	/**
	* The New-or-open dialog: an input, the matching worktrees and branches (or repos, while
	* it asks for one), and the base a new branch starts from.
	*/
	renderNew(style, dialog) {
		const { t, sizes } = style;
		const { state } = dialog;
		const lines = linesFor(state, dialog.input.value());
		const at = highlight(state, lines);
		const picking = isNone(state.repo);
		const copy = dialogCopy(state);
		const title = dialogTitle(state);
		const describe = (line) => {
			switch (line._tag) {
				case "Repo": return [lastSegment(line.repo.root), repoHint(line.repo, home())];
				case "Worktree": return [line.branch, copy.worktreeHint(line.path)];
				case "Branch": return [line.name, line.remote ? "on origin: new worktree" : "branch: new worktree"];
				case "Typed": return [line.name, line.shortcut ? "ask wt" : "new branch"];
			}
		};
		const row = (line, i) => {
			const [label, hint] = describe(line);
			return h_flex().id(`line-${i}`).h(30).flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer().when(i === at, (el) => el.bg(t.hover)).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.pickNew(cx, dialog, some(line))).child(line._tag === "Typed" && !line.shortcut ? icon("plus", 12, t.accent) : dot(line._tag === "Worktree" ? t.working : t.muted, 7, line._tag !== "Worktree")).child(div().flex_none().max_w(300).truncate().child(label)).child(div().flex_1()).child(div().min_w(0).truncate().text_size(sizes.label).text_color(t.muted).child(hint));
		};
		const baseOption = (key, label) => h_flex().id(`base-${key}`).h(24).px(9).when(key === "default", (el) => el.flex_none()).min_w(0).items_center().rounded(12).cursor_pointer().border_1().border_color(state.base === key ? t.accent : t.border).bg(state.base === key ? t.selected : t.popover).text_size(sizes.label).text_color(state.base === key ? t.foreground : t.muted).on_click((_e, cx) => {
			if (dialog.state.base !== key) dialog.state = flippedBase(dialog.state);
			cx.notify();
		}).child(div().min_w(0).truncate().child(label));
		const bases = [baseOption("default", "Default branch"), ...toArray(state.current).map((branch) => baseOption("current", `${branch} (the branch I'm on)`))];
		return this.focused(v_flex().id("new").size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(sizes.body).on_key_down((e, cx) => {
			if (e.key === "escape") return closeSelf();
			if (e.key === "down" || e.key === "up") dialog.state = moved(dialog.state, lines, e.key === "down" ? 1 : -1);
			else if (e.key === "tab" && !picking) dialog.state = flippedBase(dialog.state);
			else return;
			cx.stop_propagation();
			cx.notify();
		}).child(div().text_size(sizes.title).font_semibold().child(title)).child(h_flex().h(32).flex_none().px(10).items_center().rounded(8).border_1().border_color(t.accent).child(Input.new(dialog.input).flex_1().min_w(0).h_full().text_color(t.foreground))).child(v_flex().id("lines").flex_1().min_h(0).overflow_y_scrollbar().children(lines.map(row)).when(lines.length === 0, (el) => el.child(div().p(8).text_size(sizes.small).text_color(t.muted).child(copy.empty)))).children(toArray(state.error).map((error) => div().text_size(sizes.label).text_color(t.ansi1).child(error))).when(copy.offersBase, (el) => el.child(h_flex().w_full().min_w(0).gap(6).items_center().child(div().flex_none().text_size(sizes.label).text_color(t.muted).child("New branch from")).children(bases))).child(div().text_size(sizes.label).text_color(t.dim).child(copy.footer)));
	}
	/**
	* The Settings dialog: group folders (name, order, remove, add), the scan's depth and
	* skip names, hidden repos to show again, and the no-wrapper setting.
	*/
	renderSettings({ t, sizes }, draft) {
		const { settings } = draft;
		const edit = (change) => (_e, cx) => {
			this.editDraft(draft, change);
			cx.notify();
		};
		const small = (id, label, onClick) => h_flex().id(id).size(24).flex_none().justify_center().items_center().rounded(6).cursor_pointer().text_color(t.muted).hover((s) => s.bg(t.hover)).on_click(onClick).child(label);
		const field = (state, width) => {
			const box = h_flex().h(28).px(8).items_center().rounded(6).border_1().border_color(t.border).bg(t.input).child(Input.new(state).flex_1().min_w(0).h_full().text_color(t.foreground));
			return match$5(width, {
				onNone: () => box.flex_1().min_w(0),
				onSome: (w) => box.w(w).flex_none()
			});
		};
		const heading = (text, hint) => v_flex().pt(6).gap(2).child(div().font_semibold().child(text)).child(div().text_size(sizes.label).text_color(t.muted).child(hint));
		const hint = (text) => div().text_size(sizes.small).text_color(t.muted).child(text);
		const folders = settings.folders.map((folder, i) => h_flex().gap(6).items_center().children(toArray(fromNullishOr(draft.names[i])).map((name) => field(name, some(150)))).child(div().flex_1().min_w(0).truncate().text_size(sizes.small).text_color(t.muted).child(locatedLabel({
			machine: folder.machine,
			folder: folder.path
		}))).child(small(`up-${i}`, "↑", edit((s) => moveFolder(s, i, -1)))).child(small(`down-${i}`, "↓", edit((s) => moveFolder(s, i, 1)))).child(small(`remove-${i}`, icon("close", 12, t.muted), edit((s) => removeFolder(s, i)))));
		const hidden = settings.hidden.map((repo, i) => h_flex().gap(8).items_center().child(div().flex_none().font_medium().child(lastSegment(repo.root))).child(div().flex_1().min_w(0).truncate().text_size(sizes.small).text_color(t.muted).child(repoHint(repo, home()))).child(button(t, `unhide-${i}`, "Show again", "plain", edit((s) => unhide(s, repo)))));
		const others = otherMachines(machines());
		const machineChips = others.map((machine) => {
			const on = contains(draft.machine, machine);
			return h_flex().id(`machine-${machine}`).h(24).px(9).flex_none().items_center().rounded(12).cursor_pointer().border_1().border_color(on ? t.accent : t.border).bg(on ? t.selected : t.input).text_size(sizes.label).text_color(on ? t.foreground : t.muted).hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => {
				draft.machine = some(machine);
				cx.notify();
			}).child(machine);
		});
		const check = div().size(16).flex_none().rounded(4).border_1().border_color(settings.noWrapper ? t.accent : t.border).bg(settings.noWrapper ? t.accent : t.input);
		const body = v_flex().gap(8).pr(6).child(heading("Groups", "Each folder is scanned for repos and names a group, in this order.")).children(folders).when(folders.length === 0, (el) => el.child(hint("No group folders yet."))).child(h_flex().child(button(t, "add-folder", "Add folder on this machine…", "plain", (_e, cx) => this.pickGroupFolder(cx, draft)))).when(others.length > 0, (el) => el.child(hint("Or pick another machine, type the folder's path there (~ is its home) and add it.")).child(h_flex().gap(6).flex_wrap().children(machineChips)).child(h_flex().gap(6).items_center().child(field(draft.typed, none())).child(match$5(draft.machine, {
			onNone: () => hint("Pick a machine first"),
			onSome: (machine) => button(t, "add-typed", draft.checking ? `Checking on ${machine}…` : `Add on ${machine}`, "plain", (_e, cx) => this.addTypedFolder(cx, draft, machine))
		})))).child(heading("Scan", "How deep to look for repos, and folder names never to enter.")).child(h_flex().gap(6).items_center().child(div().w(150).flex_none().child("Depth")).child(small("depth-less", "−", edit((s) => ({
			...s,
			depth: Math.max(1, s.depth - 1)
		})))).child(div().w(20).flex_none().text_center().child(String(settings.depth))).child(small("depth-more", "+", edit((s) => ({
			...s,
			depth: Math.min(8, s.depth + 1)
		}))))).child(h_flex().gap(6).items_center().child(div().w(150).flex_none().child("Skip folders named")).child(field(draft.skip, none()))).child(heading("Hidden repos", "Repos left out of the panel.")).children(hidden).when(hidden.length === 0, (el) => el.child(hint("No hidden repos."))).child(heading("Shell wrapper", "Your own wt shell function, if you have one.")).child(h_flex().id("no-wrapper").gap(8).items_center().cursor_pointer().on_click(edit((s) => ({
			...s,
			noWrapper: !s.noWrapper
		}))).child(check).child("Run merge, remove and clean up without my wt shell function"));
		const note = match$5(draft.broken, {
			onSome: (error) => `${error}. Fix the file by hand; Settings can't save over it.`,
			onNone: () => draft.note
		});
		return this.focused(v_flex().id("settings").size_full().p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(sizes.body).on_key_down((e) => {
			if (e.key === "escape") closeSelf();
		}).child(div().text_size(sizes.title).font_semibold().child("worktrunk settings")).child(div().id("settings-body").flex_1().min_h(0).overflow_y_scrollbar().child(body)).when(note !== "", (el) => el.child(div().text_size(sizes.label).text_color(t.ansi1).child(note))).child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).text_size(sizes.label).text_color(t.dim).child(`Saved in ${tildePath(settingsFile().path, home())}. You can edit it by hand too.`)).child(button(t, "cancel", "Cancel", "plain", closeSelf)).when(isNone(draft.broken), (el) => el.child(button(t, "save", "Save", "accent", (_e, cx) => this.saveSettings(cx, draft))))));
	}
	/** The job window's title bar: what runs, and a Stop button. */
	renderTitlebar({ t, sizes }, { title, addr }) {
		const stop = (terminal) => runEdge(stopJob(terminal).pipe(match({
			onSuccess: () => none(),
			onFailure: (failed) => some(failureText(failed))
		})), some).then((failed) => map$3(failed, (body) => notify({
			title: "Couldn't stop the job",
			body,
			level: "warning"
		})));
		return h_flex().id("titlebar").size_full().px(12).gap(8).items_center().bg(t.chrome).border_b(1).border_color(t.border).text_size(sizes.label).child(icon("git", 14, t.accent)).child(div().flex_1().min_w(0).truncate().font_semibold().child(title)).child(div().text_color(t.dim).child("drag to move")).child(div().id("stop").px(10).py(3).rounded(6).cursor_pointer().text_color(t.ansi1).hover((s) => s.bg(t.hover)).on_mouse_down("left", (_event, cx) => cx.stop_propagation()).on_click(() => map$3(addr, stop)).child("Stop"));
	}
	/**
	* The machine and group dropdowns on one row (the machine one only with more than one
	* machine), the view picker, the search box and the All repos / With worktrees toggle.
	*/
	renderControls({ t, sizes }, view) {
		const dropdown = (id, title, items) => h_flex().id(id).flex_1().min_w(0).h(26).px(9).gap(6).items_center().rounded(6).cursor_pointer().border_1().border_color(t.border).bg(t.chrome).text_size(sizes.label).text_color(t.foreground).hover((s) => s.bg(t.hover)).on_click(() => openMenu(title, items)).child(div().flex_1().min_w(0).truncate().child(filterButton(items))).child(icon("chevron-down", 12, t.muted));
		const segment = (id, options, onPick) => h_flex().id(id).w_full().p(2).gap(2).rounded(8).bg(t.chrome).border_1().border_color(t.border).children(options.map(({ key, label, on }) => h_flex().id(`${id}-${key}`).flex_1().min_w(0).h(24).justify_center().items_center().rounded(6).bg(on ? t.raised : t.chrome).text_size(sizes.label).text_color(on ? t.foreground : t.muted).when(on, (el) => el.font_semibold()).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click(() => onPick(key)).child(div().truncate().child(label))));
		const search = h_flex().flex_1().min_w(0).h(28).px(8).gap(6).items_center().rounded(6).border_1().border_color(t.border).bg(t.chrome).child(icon("search", 13, t.muted)).children(toArray(this.searchBox).map((box) => Input.new(box).flex_1().min_w(0).h_full().text_size(sizes.small).text_color(t.foreground)));
		return v_flex().flex_none().px(12).py(8).gap(7).border_b(1).border_color(t.border).child(h_flex().gap(6).items_center().when(view.machineFilter.length > 0, (el) => el.child(dropdown("machine", "Machine", machineMenu(view.machineFilter)))).child(dropdown("group", "Group", groupMenu(view.chips)))).child(segment("show", view.views.map((v) => ({
			key: v.show,
			label: v.label,
			on: v.selected
		})), (key) => map$3(fromNullishOr(view.views.find((v) => v.show === key)), (picked) => setView({ show: picked.show })))).child(h_flex().gap(6).items_center().child(search).children(toArray(view.toggle).map((only) => h_flex().w(190).flex_none().child(segment("only", [{
			key: "all",
			label: "All repos",
			on: !only
		}, {
			key: "only",
			label: "With worktrees",
			on: only
		}], (key) => setView({ only: key === "only" }))))));
	}
	renderBody(style, body) {
		const { t, sizes } = style;
		switch (body._tag) {
			case "Message": return div().p(16).text_size(sizes.small).text_color(t.muted).child(body.text);
			case "NotInRepo": return v_flex().child(div().px(14).pt(12).text_size(sizes.small).font_semibold().text_color(t.muted).child(body.text)).child(this.renderBody(style, body.open));
			case "Tree": return v_flex().pb(16).children(body.repos.map((repo) => this.renderRepo(style, repo)));
			case "Flat": return v_flex().pt(6).pb(16).children(toArray(body.summary).map((summary) => h_flex().px(14).pt(4).pb(4).gap(8).items_center().text_size(sizes.label).child(div().flex_1().min_w(0).font_semibold().text_color(t.done).child(summary)).children(toArray(cleanupFor(this.lists, body.rows.map((row) => row.key))).map((action) => div().id("cleanup-all").flex_none().px(8).py(2).rounded(6).cursor_pointer().text_color(t.ansi1).hover((s) => s.bg(t.hover)).on_click(() => ask(action)).child(`Clean up all ${cleanupCount(action)}`))))).children(body.rows.map((row) => this.renderRow(style, row)));
		}
	}
	/** The tab-bar button: shows and hides the panel's block. */
	renderToggle({ t, sizes }) {
		const block = findModBlock(layout(), "iangregsondev-worktrunk");
		const on = exists(block, (b) => !b.hidden);
		return h_flex().size_full().pr(10).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border).child(h_flex().id("toggle").h(26).px(8).gap(5).flex_none().items_center().rounded(6).text_size(sizes.label).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted).cursor_pointer().hover((s) => s.bg(t.hover)).on_mouse_down("left", (_event, cx) => cx.stop_propagation()).on_click(() => map$3(block, (b) => run("layout.toggle", { id: b.id }))).child(icon("git", 14, on ? t.foreground : t.muted)).child("Worktrunk"));
	}
	renderRepo({ t, sizes }, repo) {
		const head = h_flex().id(`repo-${repo.key}`).min_h(36).px(10).mt(6).gap(8).items_center().when(repo.foldable, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => toggleFold(repo.key))).on_mouse_down("right", () => this.openRepoMenu(repo.key)).child(icon(repo.folded ? "chevron-right" : "chevron-down", 14, t.muted)).child(div().min_w(0).truncate().font_semibold().child(repo.name)).children(toArray(repo.machine).map((machine) => div().flex_none().px(6).rounded(4).border(1).border_color(t.border).text_size(sizes.label - 1).text_color(t.muted).child(machine))).children(toArray(repo.group).map((group) => div().flex_none().px(6).rounded(4).bg(t.chrome).text_size(sizes.label - 1).text_color(t.dim).child(group))).child(div().flex_1()).children(toArray(cleanupAction([{
			...repoOfKey(repo.key),
			worktrees: this.worktreesOf(repo.key)
		}])).map((action) => div().id(`cleanup-${repo.key}`).flex_none().px(6).rounded(4).text_size(sizes.label).text_color(t.done).hover((s) => s.bg(t.raised)).on_click((_event, cx) => {
			cx.stop_propagation();
			ask(action);
		}).child("Clean up"))).child(div().flex_none().text_size(sizes.label).text_color(t.muted).child(match$5(repo.count, {
			onNone: () => "…",
			onSome: String
		})));
		const note = (text, color) => div().px(16).py(4).text_size(sizes.small).text_color(color).child(text);
		const status = repo.folded || repo.status._tag === "Ok" ? [] : repo.status._tag === "Reading" ? [note("Reading…", t.muted)] : [note(repo.status.text, t.ansi1)];
		const ciNote = repo.folded ? [] : toArray(repo.ciNote).map((text) => note(text, t.muted));
		const style = {
			t,
			sizes
		};
		return v_flex().child(head).children(status).children(ciNote).children(repo.main.map((row) => this.renderRow(style, row))).children(repo.sections.map((section) => this.renderSection(style, section)));
	}
	renderSection(style, section) {
		const { t, sizes } = style;
		const color = section.kind === "merged" ? t.done : section.kind === "conflict" ? t.blocked : t.muted;
		return v_flex().child(h_flex().id(`group-${section.key}`).min_h(26).pl(18).pr(10).pt(6).gap(6).items_center().cursor_pointer().on_click(() => toggleFold(section.key)).child(icon(section.folded ? "chevron-right" : "chevron-down", 12, color)).child(div().flex_1().text_size(sizes.label).font_semibold().text_color(color).child(`${section.label} · ${section.count}`))).children(section.rows.map((row) => this.renderRow(style, row)));
	}
	renderRow({ t, sizes }, row) {
		return h_flex().id(`row-${row.key}`).min_h(40).mx(6).pl(22).pr(8).py(4).gap(9).items_center().rounded(7).cursor_pointer().when(row.current, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover)).on_click(() => onClickRow(row.click)).on_mouse_down("right", () => this.openRowMenu(row)).child(labelled(dot(toneColor(t, row.tone), 8, row.hollow), row.tips.dot)).child(v_flex().flex_1().min_w(0).child(h_flex().gap(6).items_center().child(div().min_w(0).truncate().font_medium().child(row.label)).children(toArray(row.badge).map((word) => {
			const badge = div().flex_none().px(5).rounded(4).bg(t.hover).text_size(sizes.label).text_color(t.working).child(word);
			return match$5(row.tips.badge, {
				onNone: () => badge,
				onSome: (tip) => labelled(badge, tip)
			});
		})).children(toArray(row.tips.dirty).map((tip) => labelled(dot(t.blocked, 6, false), tip)))).child(div().truncate().text_size(sizes.label).text_color(t.muted).child(row.subline))).children(toArray(zipWith(row.ci, row.tips.ci, (badge, tip) => [badge, tip])).map(([badge, tip]) => {
			const [name, color] = ciIcon(t, badge);
			const drawn = icon(name, 13, badge.stale ? t.dim : color);
			return labelled(div().flex_none().child(badge.status === "running" ? drawn.spin(1200) : drawn), tip);
		})).children(toArray(row.tips.open).map((tip) => labelled(div().flex_none().text_size(sizes.label).text_color(t.muted).child("open"), tip)));
	}
};

export { Worktrunk as default };