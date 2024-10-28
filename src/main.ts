import * as Path from "path"
import * as Process from "process"
import {promises as Fs} from "fs"

export namespace CLI {
	type MaybeUnpackArray<T> = T extends readonly (infer V)[] ? V : T

	type CommonParameterFields<V> = {
		readonly keys: readonly string[]
		readonly description?: string
		readonly allowedValues?: readonly MaybeUnpackArray<V>[]
		readonly isHidden?: boolean
	}

	type OptionalBaseParameter<V> = CommonParameterFields<V> & {
		readonly default: V
	}

	type MandatoryBaseParameter<V> = CommonParameterFields<V> & {
		readonly __neverActuallyPresentFieldForTypeInferrence: V
	}

	const isArgumentOptional = (argDef: CommonParameterFields<any>): argDef is OptionalBaseParameter<unknown> => {
		const key: keyof OptionalBaseParameter<unknown> = "default"
		return key in argDef
	}

	type BoolParameter = OptionalBaseParameter<boolean> & {
		readonly type: "bool"
		readonly isHelp?: boolean
	}

	type StringParameterFields = {
		readonly type: "string" | "path"
		readonly minLength?: string
		readonly maxLength?: string
		readonly mustMatch?: RegExp
	}
	type OptStringParameter<T> = OptionalBaseParameter<T> & StringParameterFields
	type ManStringParameter<T> = MandatoryBaseParameter<T> & StringParameterFields
	type StringParameter<T extends string = string> = OptStringParameter<T> | ManStringParameter<T>

	type NumberParameterFields = {
		readonly type: "int" | "double"
		readonly min?: number
		readonly max?: number
	}
	type OptNumberParameter<T> = OptionalBaseParameter<T> & NumberParameterFields
  type ManNumberParameter<T> = MandatoryBaseParameter<T> & NumberParameterFields
	type NumberParameter<T extends number = number> = OptNumberParameter<T> | ManNumberParameter<T>

	type StringArrParameterFields = {
		readonly type: "array of path" | "array of string"
		readonly minLength?: string
		readonly maxLength?: string
		readonly mustMatch?: RegExp
	}
	type OptStringArrParameter<T> = OptionalBaseParameter<readonly T[]> & StringArrParameterFields
	type ManStringArrParameter<T> = MandatoryBaseParameter<readonly T[]> & StringArrParameterFields
	type StringArrParameter<T extends string = string> = OptStringArrParameter<T> | ManStringArrParameter<T>

	type NumberArrParameterFields = {
		readonly type: "array of int" | "array of double"
		readonly min?: number
		readonly max?: number
	}
	type OptNumberArrParameter<T> = OptionalBaseParameter<readonly T[]> & NumberArrParameterFields
	type ManNumberArrParameter<T> = MandatoryBaseParameter<readonly T[]> & NumberArrParameterFields
	type NumberArrParameter<T extends number = number> = OptNumberArrParameter<T> | ManNumberArrParameter<T>

	type Parameter =
		| BoolParameter
		| StringParameter
		| NumberParameter
		| StringArrParameter
		| NumberArrParameter

	function isArrayParameter(def: Parameter): def is StringArrParameter | NumberArrParameter {
		return [
			"array of string",
			"array of path",
			"array of int",
			"array of double"
		].includes(def.type)
	}

	type ParameterMap = Readonly<Record<string, Parameter>>
	export type Definition<T extends ParameterMap> = {
		readonly params: Params<T>
		/** Transform array of command-line arguments (defaults to process.argv) into structured object */
		parse(values?: readonly string[]): ParsingResult<T>
		/** Add defaults to object with mandatory arguments, check for constraints */
		updateStructuredArguments(values: StructuredInput<T>): ParsingResult<T>
	}

	/** Get shape of object that will hold all the arguments from definition of command-line interface */
	export type ArgsByDefinition<C> = C extends Definition<infer T> ? ParsingResult<T> : never
	/** Get object that can serve as input for the command-line interface.
	Similar to ArgsByDefinition, but fields with defaults are optional. */
	export type InputByDefinition<C> = C extends Definition<infer T> ? StructuredInput<T> : never
	type ParsingResult<T extends ParameterMap> = {readonly [k in keyof T]: ParameterType<T[k]>}
	type StructuredInput<T extends ParameterMap> = {
		readonly [k in KeysExtendingValues<T, MandatoryBaseParameter<any>>]: ParameterType<T[k]>
	} & {
		readonly [k in KeysExtendingValues<T, OptionalBaseParameter<any>>]?: ParameterType<T[k]>
	}
	type ParameterType<T extends Parameter> = T extends MandatoryBaseParameter<infer V> | OptionalBaseParameter<infer V> ? V : never
	type KeysExtendingValues<T, V, K = keyof T> = K extends keyof T ? T[K] extends V ? K : never : never

	interface Params<T extends ParameterMap> {
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
		readonly options: T
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
	export const define = <T extends ParameterMap>(params: Params<T>): Definition<T> => new DefinitionImpl(params)

	class DefinitionImpl<T extends ParameterMap> implements Definition<T> {

		static get processArgvWithoutExecutables(): readonly string[] {
			return process.argv.slice(2)
		}

		readonly params: Params<T>
		constructor(params: Params<T>) {
			this.params = this.tryAddDefaultHelpOption(params)
		}

		private tryAddDefaultHelpOption(params: Params<T>): Params<T> {
			if(params.noAutoHelp){
				return params
			}

			let haveDesignatedHelp = false
			for(const argName in params.options){
				const def = params.options[argName]!
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
				const def = this.params.options[argName]!
				return def.keys.join(", ") + " (" + def.type + ")"
			}

			const maxKeyLength: number = argNames.map(argName => keyPart(argName).length).reduce((a, b) => Math.max(a, b), 0) + 1

			argNames.forEach(argName => {
				const def = this.params.options[argName]!
				if(def.isHidden){
					return
				}

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
				const keys = this.params.options[argName]!.keys
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
		parse(values: readonly string[] = DefinitionImpl.processArgvWithoutExecutables): ParsingResult<T> {
			let result = this.extract(values)
			result = this.setDefaults(result)
			this.checkConstraints(result)
			return this.finalize(result)
		}

		updateStructuredArguments(values: StructuredInput<T>): ParsingResult<T> {
			const result = this.setDefaults(values)
			this.checkConstraints(result)
			return this.finalize(result)
		}

		private checkNumber(name: string, def: NumberParameter | NumberArrParameter, value: unknown): void {
			if(typeof(value) !== "number"){
				this.fail(`Expected number as CLI argument ${name}, but got ${typeof(value)}`)
			}
			if(typeof(def.min) === "number" && value < def.min){
				this.fail(`CLI argument "${name}" cannot go below ${def.min}; got ${value}.`)
			}
			if(typeof(def.max) === "number" && value > def.max){
				this.fail(`CLI argument "${name}" cannot go above ${def.min}; got ${value}.`)
			}
			if(def.type === "int" || def.type === "array of int" && (value % 1) !== 0){
				this.fail(`CLI argument ${name} expected integer, but got fractional number instead: ${value}`)
			}
			if(!Number.isFinite(value)){
				this.fail(`Expected "${name}" to be a finite number, but it's not: ${value}`)
			}
			this.checkAllowedValues(name, def.allowedValues, value)
		}

		private checkString(name: string, def: StringParameter | StringArrParameter, value: unknown): void {
			if(typeof(value) !== "string"){
				this.fail(`Expected string as CLI argument ${name}, but got ${typeof(value)}`)
			}
			if(typeof(def.minLength) === "number" && value.length < def.minLength){
				this.fail(`CLI argument "${name}" is too short - must be at least ${def.minLength} characters; got ${value.length} characters.`)
			}
			if(typeof(def.maxLength) === "number" && value.length > def.maxLength){
				this.fail(`CLI argument "${name}" is too long - must be at most ${def.maxLength} characters; got ${value.length} characters.`)
			}
			if(def.mustMatch instanceof RegExp && !def.mustMatch.test(value)){
				this.fail(`CLI argument "${name}" must match ${def.mustMatch}`)
			}
			this.checkAllowedValues(name, def.allowedValues, value)
		}

		private checkBoolean(name: string, value: unknown): void {
			if(typeof(value) !== "boolean"){
				this.fail(`Expected boolean as CLI argument ${name}, but got ${typeof(value)}`)
			}
		}

		private checkArrayOf(name: string, checkInner: (element: unknown) => void, value: unknown): void {
			if(!Array.isArray(value)){
				this.fail(`Expected array as CLI argument ${name}, but got ${typeof(value)}.`)
			}
			value.forEach(element => checkInner(element))
		}

		private checkAllowedValues<T>(name: string, values: readonly T[] | undefined, value: T): void {
			if(!values){
				return
			}
			if(values && values.indexOf(value) < 0){
				this.fail(`CLI argument "${name}" is not in allowed values set: it's ${JSON.stringify(value)}, while allowed values are ${values.map(x => JSON.stringify(x)).join(", ")}`)
			}
		}

		/** Transform array of raw CLI arguments into object */
		private extract(values: readonly string[]): Partial<ParsingResult<T>> {
			const knownArguments = new Set<keyof(T)>()
			const keyToArgNameMap = this.buildKeysMap()

			const result: any = {}

			for(let i = 0; i < values.length; i++){
				const v = values[i]!
				if(!keyToArgNameMap.has(v)){
					this.fail(`Unknown CLI parameter: "${v}".`)
				}

				const argName = keyToArgNameMap.get(v) as string & keyof(T)
				const def = this.params.options[argName]!
				const isArray = isArrayParameter(def)
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
						case "array of int":
						case "double":
						case "array of double":{
							actualValue = parseFloat(values[i]!)
						} break
						case "string":
						case "array of string":
						case "path":
						case "array of path": {
							actualValue = values[i]!
						} break
						default:
							throw new Error(`Unexpected argument value type: ${(def as Parameter).type}`)
					}
				}

				if(isArray){
					const arr = (result[argName] as unknown[]) ?? []
					arr.push(actualValue)
				} else {
					result[argName] = actualValue
				}
			}

			return result
		}

		private resolvePath(argValue: string): string {
			return Path.resolve(
				this.params.pathResolveBase || ".",
				argValue
			)
		}

		private checkConstraints(result: Partial<ParsingResult<T>>): void {
			for(const [argName, def] of Object.entries(this.params.options)){
				switch(def.type){
					case "double":
					case "int":{
						this.checkNumber(argName, def, result[argName])
					} break
					case "string":
					case "path": {
						this.checkString(argName, def, result[argName])
					} break
					case "bool": {
						this.checkBoolean(argName, result[argName])
					} break
					case "array of double":
					case "array of int": {
						this.checkArrayOf(argName, x => this.checkNumber(argName, def, x), result[argName])
					} break
					case "array of string":
					case "array of path": {
						this.checkArrayOf(argName, x => this.checkString(argName, def, x), result[argName])
					} break
					default:
						throw new Error(`Unexpected parameter type: ${(def as Parameter).type}`)
				}
			}
		}

		private setDefaults(args: Partial<ParsingResult<T>> | StructuredInput<T>): Partial<ParsingResult<T>> {
			const result: any = {...args}
			for(const [argName, def] of Object.entries(this.params.options)){
				if(!("argName" in result) && isArgumentOptional(def)){
					result[argName] = def.default
				}

				if(!("argName" in result)){
					// we could throw error about not having mandatory argument here
					// but this will break --help
					continue
				}

				if(def.type === "path"){
					result[argName] = this.resolvePath(result[argName] as string)
				} else if(def.type === "array of path"){
					result[argName] = (result[argName] as string[])
						.map(defaultPath => this.resolvePath(defaultPath))
				}
			}
			return result
		}

		/** Check everything that was not checked until this point, and process help if any */
		private finalize(result: Partial<ParsingResult<T>>): ParsingResult<T> {
			const abstentMandatories: (string & keyof T)[] = []
			let haveHelp = false;
			(Object.keys(this.params.options) as (string & keyof(T))[]).forEach(argName => {
				const def = this.params.options[argName]!

				if(def.type === "bool" && def.isHelp && !!result[argName]){
					haveHelp = true
				}

				if(!(argName in result) && !isArgumentOptional(def)){
					abstentMandatories.push(argName)
				}
			})

			if(haveHelp && !this.params.noAutoHelp){
				this.printHelp()
			}

			if(!haveHelp && abstentMandatories.length > 0){
				const keys = abstentMandatories.map(opt => this.getLongestKey(opt))
				this.fail("Some mandatory CLI arguments are absent: " + keys.join(", "))
			}

			return result as ParsingResult<T>
		}

		private getLongestKey(opt: string & keyof T): string {
			const def = this.params.options[opt]!
			return [...def.keys].sort((a, b) => b.length - a.length)[0] ?? opt
		}

	}

	type DistributedOmit<T, K> = T extends any ? Pick<T, Exclude<keyof T, K>> : never
	type HelperFnOptions<T extends Parameter> = DistributedOmit<T, "keys" | "type" | "__neverActuallyPresentFieldForTypeInferrence"> & {keys: string | readonly string[]}
	const processCommonValues = <T extends Parameter>(type: T["type"], params: HelperFnOptions<T>) => ({
		...params,
		type,
		keys: Array.isArray(params.keys) ? params.keys : [params.keys]
	})


	export function str<T extends string = string>(params: HelperFnOptions<OptStringParameter<T>>): OptStringParameter<T>
	export function str<T extends string = string>(params: HelperFnOptions<ManStringParameter<T>>): ManStringParameter<T>
	export function str<T extends string = string>(params: HelperFnOptions<StringParameter<T>>): StringParameter<T> {
		return processCommonValues("string", params) as StringParameter<T>
	}

	export function strArr<T extends string = string>(params: HelperFnOptions<OptStringArrParameter<T>>): OptStringArrParameter<T>
	export function strArr<T extends string = string>(params: HelperFnOptions<ManStringArrParameter<T>>): ManStringArrParameter<T>
	export function strArr<T extends string = string>(params: HelperFnOptions<StringArrParameter<T>>): StringArrParameter<T> {
		return processCommonValues("array of string", params) as StringArrParameter<T>
	}

	/** Path option. String that will be auto-resolved to absolute path; See `pathResolveBase` parameter. */
	export function path<T extends string = string>(params: HelperFnOptions<OptStringParameter<T>>): OptStringParameter<T>
	export function path<T extends string = string>(params: HelperFnOptions<ManStringParameter<T>>): ManStringParameter<T>
	export function path<T extends string = string>(params: HelperFnOptions<StringParameter<T>>): StringParameter<T> {
		return processCommonValues("string", params) as StringParameter<T>
	}

	export function pathArr<T extends string = string>(params: HelperFnOptions<OptStringArrParameter<T>>): OptStringArrParameter<T>
	export function pathArr<T extends string = string>(params: HelperFnOptions<ManStringArrParameter<T>>): ManStringArrParameter<T>
	export function pathArr<T extends string = string>(params: HelperFnOptions<StringArrParameter<T>>): StringArrParameter<T> {
		return processCommonValues("array of string", params) as StringArrParameter<T>
	}

	export function number<T extends number = number>(params: HelperFnOptions<OptNumberParameter<T>>): OptNumberParameter<T>
	export function number<T extends number = number>(params: HelperFnOptions<ManNumberParameter<T>>): ManNumberParameter<T>
	export function number<T extends number = number>(params: HelperFnOptions<NumberParameter<T>>): NumberParameter<T> {
		return processCommonValues("double", params) as NumberParameter<T>
	}

	export function numberArr<T extends number = number>(params: HelperFnOptions<OptNumberArrParameter<T>>): OptNumberArrParameter<T>
	export function numberArr<T extends number = number>(params: HelperFnOptions<ManNumberArrParameter<T>>): ManNumberArrParameter<T>
	export function numberArr<T extends number = number>(params: HelperFnOptions<NumberArrParameter<T>>): NumberArrParameter<T> {
		return processCommonValues("array of double", params) as NumberArrParameter<T>
	}

	export function int<T extends number = number>(params: HelperFnOptions<OptNumberParameter<T>>): OptNumberParameter<T>
	export function int<T extends number = number>(params: HelperFnOptions<ManNumberParameter<T>>): ManNumberParameter<T>
	export function int<T extends number = number>(params: HelperFnOptions<NumberParameter<T>>): NumberParameter<T> {
		return processCommonValues("int", params) as NumberParameter<T>
	}

	export function intArr<T extends number = number>(params: HelperFnOptions<OptNumberArrParameter<T>>): OptNumberArrParameter<T>
	export function intArr<T extends number = number>(params: HelperFnOptions<ManNumberArrParameter<T>>): ManNumberArrParameter<T>
	export function intArr<T extends number = number>(params: HelperFnOptions<NumberArrParameter<T>>): NumberArrParameter<T> {
		return processCommonValues("array of int", params) as NumberArrParameter<T>
	}

	/** Boolean option. If not passed - assumed to be false; if passed - assumed to be true. */
	export function bool(params: Omit<HelperFnOptions<BoolParameter>, "default" | "isHelp">): BoolParameter {
		return {
			...processCommonValues("bool", {...params, default: false}),
			isHelp: false
		} as BoolParameter
	}

	/** Designated help boolean option. See `noAutoHelp` for further explainations. */
	export function help(params: Omit<HelperFnOptions<BoolParameter>, "default" | "isHelp">): BoolParameter {
		return {
			...processCommonValues("bool", {...params, default: false}),
			isHelp: true
		} as BoolParameter
	}

	const minPort = 1
	const maxPort = 65535

	/** Port number. Same as `CLI.int()` with min = 1 and max = 65535. */
	export function port<T extends number = number>(params: Omit<HelperFnOptions<OptNumberParameter<T>>, "min" | "max">): OptNumberParameter<T>
	export function port<T extends number = number>(params: Omit<HelperFnOptions<ManNumberParameter<T>>, "min" | "max">): ManNumberParameter<T>
	export function port<T extends number = number>(params: Omit<HelperFnOptions<NumberParameter<T>>, "min" | "max">): NumberParameter<T> {
		return {
			...processCommonValues("int", params),
			min: minPort,
			max: maxPort
		} as unknown as NumberParameter<T>
	}

	export function portArr<T extends number = number>(params: Omit<HelperFnOptions<OptNumberParameter<T>>, "min" | "max">): OptNumberParameter<T>
	export function portArr<T extends number = number>(params: Omit<HelperFnOptions<ManNumberParameter<T>>, "min" | "max">): ManNumberParameter<T>
	export function portArr<T extends number = number>(params: Omit<HelperFnOptions<NumberParameter<T>>, "min" | "max">): NumberParameter<T> {
		return {
			...processCommonValues("int", params),
			min: minPort,
			max: maxPort
		} as unknown as NumberParameter<T>
	}

	/** Test if currently running script was required as a module, or was started as is with node.
	Would false-positive if testing script was bundled with some other script (but who does that for CLI utils anyway).
	@param importMetaUrl URL of script to test. Usually this will be `import.meta.url` value. */
	export const isRunningAsCLI = async(importMetaUrl: string): Promise<boolean> => {
		const argv1 = Process.argv[1]
		if(!argv1){
			return false // probably running from REPL...?
		}
		let jsFilePath = argv1
		try {
			// resolving realpath is necessary for scripts in node_modules/.bin/
			// as they are symlinks to real thing
			jsFilePath = await Fs.realpath(jsFilePath)
		} catch(e){
			if((e as any).type !== "ENOENT"){
				// this function is not allowed to throw really
				// because if script is requested as module - this will probably ruin the whole requesting app
				// which is unacceptable
				return false
			}

			// node allows to omit .js extensions; `node my_file` will call my_file.js
			// (path without .js will appear in argv, but import.meta.url will still contain path with .js)
			// realpath doesn't know about omitted .js and will throw ENOENT
			// to fix that, we are appending the extension manually and trying again
			if(!importMetaUrl.toLowerCase().endsWith(".js")){
				// I'm assuming node does this only for .js files
				// at least I couldn't find any more extensions that trigger this behaviour
				return false
			}

			jsFilePath += ".js"
			try {
				jsFilePath = await Fs.realpath(jsFilePath)
			} catch(e){
				void e
				return false
			}
		}

		return importMetaUrl.endsWith(jsFilePath)
	}

	/** Create a function that will accept parsed command-line arguments and do some work.
	If declaring file is launched via node directly (see isRunningAsCLI) - this function will be invoked.
	If declaring file is requested as module from some other place - that requesting module will be able to call the function.
	@param importMetaUrl URL of script to test. Usually this will be `import.meta.url` value. */
	export const defineMain = <T extends ParameterMap, R>(cli: Definition<T>, importMetaUrl: string, handler: (cliArgs: ParsingResult<T>) => R): (args: StructuredInput<T>) => R => {

		void(async() => {
			if(await isRunningAsCLI(importMetaUrl)){
				handler(cli.parse())
			}
		})()

		return (args: StructuredInput<T>) => handler(cli.updateStructuredArguments(args))
	}

}