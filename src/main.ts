// that's for Parcel. apparently he's not smart enough to detect them automatically. (why?)
/// <reference types="@types/node" />

import * as Path from "path"

export namespace CLI {
	type MaybeUnpackArray<T> = T extends readonly (infer V)[] ? V : T

	interface BaseArgDef<V> {
		readonly default?: V
		readonly keys: string[]
		readonly description?: string
		readonly allowedValues?: readonly MaybeUnpackArray<V>[]
	}

	interface BoolArgDef extends BaseArgDef<boolean>{
		readonly type: "bool"
		readonly isHelp?: boolean
	}

	interface StringArgDef<T extends string = string> extends BaseArgDef<T>{
		readonly type: "string" | "path"
		readonly minLength?: string
		readonly maxLength?: string
		readonly mustMatch?: RegExp
	}

	interface NumberArgDef<T extends number = number> extends BaseArgDef<T>{
		readonly type: "int" | "double"
		readonly min?: number
		readonly max?: number
	}

	interface StringArrArgDef<T extends string = string> extends BaseArgDef<readonly T[]>{
		readonly type: "array of path" | "array of string"
		readonly minLength?: string
		readonly maxLength?: string
		readonly mustMatch?: RegExp
	}

	interface NumberArrArgDef<T extends number = number> extends BaseArgDef<readonly T[]>{
		readonly type: "array of int" | "array of double"
		readonly min?: number
		readonly max?: number
	}

	type ArgDef =
		| BoolArgDef
		| StringArgDef
		| NumberArgDef
		| StringArrArgDef
		| NumberArrArgDef

	function isArrayArgDef(def: ArgDef): def is StringArrArgDef | NumberArrArgDef {
		return [
			"array of string",
			"array of path",
			"array of int",
			"array of double"
		].includes(def.type)
	}

	export type ArgsByDefinition<C> = C extends Definition<infer T> ? {readonly [k in keyof T]: T[k]} : never

	interface Params<T> {
		/** Defitions of command-line options that program will accept.
		Auto-generated help option may be added to those options, see `noAutoHelp` parameter.
		Value of this parameter could look like this:
		{
			name: CLI.str({
				keys: ["-n", "--name"],
				description: "It's a name!"
			}),
			port: CLI.port({
				keys: ["-p", "--port"],
				description: "Port on which this tool will listen for HTTP requests."
			})
		} */
		readonly options: {readonly [k in keyof(T)]: ArgDef & BaseArgDef<T[k]>}
		/** By default, two things will happen:
		1. if there's no definition for designated help option, one will be created;
		2. if designated help option is passed, `displayHelp` parameter will be called, see comments there
		Also if help argument is passed - other parameters become non-mandatory.
		This behaviour can be disabled by passing this parameter,
		but this means that you may get incomplete parsing result if you have custom `CLI.help()` option. */
		readonly noAutoHelp?: boolean
		/** If autohelp is enabled, this text will be displayed before list of options. */
		readonly helpHeader?: string
		/** By default, if there are any problems with passed arguments -
		error message will be printed to stderr and program will exit with code 1.
		This parameter allows you to override this behaviour. */
		displayUserError?(e: Error): never
		/** By default, if autohelp is enabled and user passed help option -
		help will be printed to stdout and program will exit with code 0
		This parameter allows you to override this behaviour. */
		displayHelp?(lines: string[]): never
		/** What path should be used as base for resolving `Cli.path()` options.
		Default is program working directory */
		readonly pathResolveBase?: string
	}

	function defaultHelpPrinter(lines: string[]): never {
		lines.forEach(line => console.log(line))
		process.exit(0)
	}

	function defaultErrorHandler(error: Error): never {
		console.error(error.message)
		process.exit(1)
	}

	/** Entrypoint of the library; creates new CLI definition. */
	export const define = <T>(params: Params<T>): Definition<T> => new Definition(params)

	class Definition<T> {

		static get processArgvWithoutExecutables(): readonly string[] {
			return process.argv.slice(2)
		}

		private readonly params: Params<T>
		constructor(params: Params<T>) {
			params = this.tryAddDefaultHelpOption(params)

			this.params = params
		}

		private tryAddDefaultHelpOption(params: Params<T>): Params<T> {
			if(params.noAutoHelp){
				return params
			}

			let haveDesignatedHelp = false
			for(const argName in params.options){
				const def = params.options[argName]
				if(def.type === "bool" && def.isHelp){
					haveDesignatedHelp = true
					break
				}
			}

			if(haveDesignatedHelp){
				return params
			}

			return {
				...params,
				options: {
					...params.options,
					help: help({
						keys: ["-h", "--h", "-help", "--help"],
						description: "Display this help and exit."
					})
				}
			}
		}

		private fail(msg: string): never {
			return (this.params.displayUserError || defaultErrorHandler)(new Error(msg))
		}

		private printHelp(): never {
			const helpLines = this.params.helpHeader ? [this.params.helpHeader] : []

			const argNames = Object.keys(this.params.options) as (string & keyof(T))[]

			const keyPart = (argName: string & keyof(T)) => {
				const def = this.params.options[argName]
				return def.keys.join(", ") + " (" + def.type + ")"
			}

			const maxKeyLength: number = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0) + 1

			argNames.forEach(argName => {
				const def = this.params.options[argName]
				let line = keyPart(argName)
				while(line.length < maxKeyLength){
					line += " "
				}
				if(def.description){
					line += ": " + def.description
				}
				if(def.allowedValues){
					if(def.description){
						line += ";"
					}
					line += " allowed values: " + def.allowedValues.join(", ")
				}
				helpLines.push(line)
			})

			const handler = this.params.displayHelp || defaultHelpPrinter
			return handler(helpLines)
		}

		private buildKeysMap(): Map<string, string & keyof(T)> {
			const result = new Map<string, string & keyof(T)>()
			const knownNames = new Set<string & keyof(T)>();
			(Object.keys(this.params.options) as (string & keyof(T))[]).forEach(argName => {
				const keys = this.params.options[argName].keys
				if(keys.length === 0){
					throw new Error(`CLI argument "${argName}" has no keys with which it could be passed.`)
				}

				if(knownNames.has(argName)){
					throw new Error(`CLI argument "${argName}" is mentioned twice in arguments description.`)
				}
				knownNames.add(argName)

				keys.forEach(key => {
					if(result.has(key)){
						throw new Error(`CLI argument key "${key}" is bound to more than one argument: "${argName}", "${result.get(key)}".`)
					}
					result.set(key, argName)
				})
			})

			return result
		}

		/** Main method of the class.
		* Parses value from arguments, puts them into object, validates them.
		* If there's user error - displays it and exits.
		* If there's help flag - displays help and exits. */
		parse(values: readonly string[] = Definition.processArgvWithoutExecutables): ArgsByDefinition<this> {
			return this.finalize(this.extract(values)) as ArgsByDefinition<this>
		}

		private checkNumber(name: string, def: NumberArgDef | NumberArrArgDef, value: number): void {
			if(typeof(def.min) === "number" && value < def.min){
				this.fail(`Value of CLI argument "${name}" cannot go below ${def.min}; got ${value}.`)
			}
			if(typeof(def.max) === "number" && value > def.max){
				this.fail(`Value of CLI argument "${name}" cannot go above ${def.min}; got ${value}.`)
			}
		}

		private checkString(name: string, def: StringArgDef | StringArrArgDef, value: string): void {
			if(typeof(def.minLength) === "number" && value.length < def.minLength){
				this.fail(`Value for CLI argument "${name}" is too short - must be at least ${def.minLength} characters; got ${value.length} characters.`)
			}
			if(typeof(def.maxLength) === "number" && value.length > def.maxLength){
				this.fail(`Value for CLI argument "${name}" is too long - must be at most ${def.maxLength} characters; got ${value.length} characters.`)
			}
			if(def.mustMatch instanceof RegExp && !def.mustMatch.test(value)){
				this.fail(`Value for CLI argument "${name}" must match ${def.mustMatch}`)
			}
		}

		/** Transform array of raw CLI arguments into object */
		private extract(values: readonly string[]): Record<keyof T, unknown> {
			const knownArguments = new Set<keyof(T)>()
			const keyToArgNameMap = this.buildKeysMap()

			const result = {} as Record<keyof T, unknown>

			for(let i = 0; i < values.length; i++){
				const v = values[i]!
				if(!keyToArgNameMap.has(v)){
					this.fail(`Unknown CLI argument key: "${v}".`)
				}

				const argName = keyToArgNameMap.get(v) as string & keyof(T)
				const def = this.params.options[argName]
				const isArray = isArrayArgDef(def)
				if(knownArguments.has(argName) && !isArray){
					this.fail(`CLI argument "${argName}" passed more than once, last time with key "${v}". This parameter is not an array parameter and expected no more than one value.`)
				}
				knownArguments.add(argName)

				let actualValue: unknown
				if(def.type === "bool"){
					actualValue = true
				} else {
					if(i === values.length - 1){
						this.fail("Expected to have some value after CLI key \"" + v + "\".")
					}
					i++

					switch(def.type){
						case "int":
						case "array of int":{
							const num = actualValue = this.extractIntFrom(values[i]!)
							this.checkNumber(argName, def, num)
						} break
						case "double":
						case "array of double":{
							const num = actualValue = this.extractDoubleFrom(values[i]!)
							this.checkNumber(argName, def, num)
						} break
						case "string":
						case "array of string": {
							const str = actualValue = values[i]!
							this.checkString(argName, def, str)
						} break
						case "path":
						case "array of path": {
							const str = actualValue = this.extractPathFrom(values[i]!)
							this.checkString(argName, def, str)
							break
						} default:
							throw new Error(`Unexpected argument value type: ${(def as ArgDef).type}`)
					}

					const allowedValues = def.allowedValues as unknown[] | undefined
					if(allowedValues && allowedValues.indexOf(actualValue) < 0){
						this.fail(`Value of CLI argument "${argName}" is not in allowed values set: it's ${JSON.stringify(values[i])}, while allowed values are ${allowedValues.map(x => JSON.stringify(x)).join(", ")}`)
					}

					if(isArray){
						const arr = (result[argName] as unknown[]) || []
						arr.push(actualValue)
						actualValue = arr
					}
				}

				result[argName] = actualValue
			}

			return result
		}

		private extractIntFrom(argValue: string): number {
			const num = this.extractDoubleFrom(argValue)
			if((num % 1) !== 0){
				this.fail(`Expected "${argValue}" to be an integer number, but it's not.`)
			}
			return num
		}

		private extractDoubleFrom(argValue: string): number {
			const num = parseFloat(argValue as string)
			if(!Number.isFinite(num)){
				this.fail(`Expected "${argValue}" to be a finite number, but it's not.`)
			}
			return num
		}

		private extractPathFrom(argValue: string): string {
			return Path.resolve(
				this.params.pathResolveBase || ".",
				argValue
			)
		}


		/** Check everything that was not checked until this point, and process help if any */
		private finalize(result: Record<keyof T, unknown>): T {
			const abstentMandatories: string[] = []
			let haveHelp = false;
			(Object.keys(this.params.options) as (string & keyof(T))[]).forEach(argName => {
				const def = this.params.options[argName]

				if(def.type === "bool" && def.isHelp && !!result[argName]){
					haveHelp = true
				}

				if(argName in result){
					return
				}

				if(def.default !== undefined){
					result[argName] = def.default
					if(def.type === "path"){
						result[argName] = this.extractPathFrom(result[argName] as string)
					} else if(def.type === "array of path"){
						result[argName] = (result[argName] as string[])
							.map(defaultPath => this.extractPathFrom(defaultPath))
					}
				} else {
					abstentMandatories.push(argName)
				}
			})

			if(haveHelp && !this.params.noAutoHelp){
				this.printHelp()
			}

			if(!haveHelp && abstentMandatories.length > 0){
				this.fail("Some mandatory CLI arguments are absent: " + abstentMandatories.map(x => "\"" + x + "\"").join(", "))
			}

			return result as T
		}

	}

	type HelperFnOptions<T extends BaseArgDef<unknown>> = Omit<T, "keys" | "type"> & {keys: string | readonly string[]}
	const processCommonValues = <T extends ArgDef>(type: T["type"], params: HelperFnOptions<T>) => ({
		...params,
		type,
		keys: Array.isArray(params.keys) ? params.keys : [params.keys]
	})


	export const str = <T extends string = string>(params: HelperFnOptions<StringArgDef<T>>): StringArgDef<T> =>
		processCommonValues("string", params) as StringArgDef<T>
	export const strArr = <T extends string = string>(params: HelperFnOptions<StringArrArgDef<T>>): StringArrArgDef<T> =>
		processCommonValues("array of string", params) as StringArrArgDef<T>
	/** Path option. String that will be auto-resolved to absolute path; See `pathResolveBase` parameter. */
	export const path = <T extends string = string>(params: HelperFnOptions<StringArgDef<T>>): StringArgDef<T> =>
		processCommonValues("string", params) as StringArgDef<T>
	export const pathArr = <T extends string = string>(params: HelperFnOptions<StringArrArgDef<T>>): StringArrArgDef<T> =>
		processCommonValues("array of string", params) as StringArrArgDef<T>

	export const number = <T extends number = number>(params: HelperFnOptions<NumberArgDef<T>>): NumberArgDef<T> =>
		processCommonValues("double", params) as NumberArgDef<T>
	export const numberArr = <T extends number = number>(params: HelperFnOptions<NumberArrArgDef<T>>): NumberArrArgDef<T> =>
		processCommonValues("array of double", params) as NumberArrArgDef<T>
	export const int = <T extends number = number>(params: HelperFnOptions<NumberArgDef<T>>): NumberArgDef<T> =>
		processCommonValues("int", params) as NumberArgDef<T>
	export const intArr = <T extends number = number>(params: HelperFnOptions<NumberArrArgDef<T>>): NumberArrArgDef<T> =>
		processCommonValues("array of int", params) as NumberArrArgDef<T>

	/** Boolean option. If not passed - assumed to be false; if passed - assumed to be true. */
	export const bool = (params: Omit<HelperFnOptions<BoolArgDef>, "default" | "isHelp">): BoolArgDef => ({
		...processCommonValues("bool", params),
		default: false,
		isHelp: false
	} as BoolArgDef)

	/** Designated help boolean option. See `noAutoHelp` for further explainations. */
	export const help = (params: Omit<HelperFnOptions<BoolArgDef>, "default" | "isHelp">): BoolArgDef => ({
		...processCommonValues("bool", params),
		default: false,
		isHelp: true
	} as BoolArgDef)

	const minPort = 1
	const maxPort = 65535

	/** Port number. Same as `CLI.int()` with min = 1 and max = 65535. */
	export const port = <T extends number = number>(params: Omit<HelperFnOptions<NumberArgDef<T>>, "min" | "max">): NumberArgDef<T> => ({
		...processCommonValues("int", params),
		min: minPort,
		max: maxPort
	} as NumberArgDef<T>)
	export const portArr = <T extends number = number>(params: Omit<HelperFnOptions<NumberArgDef<T>>, "min" | "max">): NumberArgDef<T> => ({
		...processCommonValues("int", params),
		min: minPort,
		max: maxPort
	} as NumberArgDef<T>)

}