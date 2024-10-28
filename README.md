# @nartallax/cli

A library for creating command-line interface for NodeJS applications  

## Install

```bash
npm install @nartallax/cli
```

## Use

```ts
import {CLI} from "@nartallax/cli"

// let's start with defining our options
const definition = CLI.define({
  // this is header that will be displayed in `--help`
  // as you can see, for this example we will define options for web application
  helpHeader: "Multiplication web application",
  options: {
    // simple number option.
    // note that this option will accept fractions; there is `CLI.int()` that won't.
    multiplier: CLI.number({
      keys: ["-m", "--multiplier"],
      description: "Factor by which input value will be multiplied",
      default: 2
    }),
    // enum option - only allows to pass a value from a predefined set of strings
    // parsed value will be typed as union of constants, not just `string`
    mode: CLI.str<"as-usual" | "negate">({
      keys: "--mode",
      description: "Mode in which application will work.",
      allowedValues: ["as-usual", "negate"],
      default: "as-usual"
    }),
    // port option - same as `CLI.int()` but with pre-defined boundaries
    port: CLI.port({
      keys: ["-p", "--port"],
      description: "Port on which web application will expose its UI",
      default: 46725
    }),
    // path option - same as `CLI.str()` but with built-in resolving to absolute path
    configPath: CLI.path({
      keys: ["-c", "--config-path"],
      description: "Path to config file"
      // no default here! it means this option is mandatory and can only be skipped if help is passed.
    }),
    // path array option
    // most options can be arrays, not only paths
    // user could pass multiple values like this: `--preset a.json --preset b.json`
    presets: CLI.pathArr({
      keys: "--preset",
      description: "Operation preset files.",
      default: []
    })
    // other types of options and constraints are available, make sure to check type definitions
  }
  // other parameters are possible to pass here, but I leave them for you to discover
})

// we may want to get the type we just defined
// after parsing arguments will be organised as object
export type CLIArgs = CLI.ArgsByDefinition<typeof definition>

// and, at last, let's parse arguments that were passed to our program
// default source or arguments is `process.argv`, but you may pass something custom here
export const parseCliArgs = (): CLIArgs => definition.parse()


// alternatively, if you want to also provide JS API, not only CLI, you could use defineMain.
// defineMain will run provided callback if import.meta.url points to currently executed file
// and will also create a wrapper for the callback for case when it is imported and used as a package
export const doMainThing = CLI.defineMain(definition, import.meta.url, async args => {
  await doTheThing(args)
})
```
