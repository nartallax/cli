import * as Process from "process"
import { buildUtils } from "@nartallax/ts-build-utils";

let {clear, build, copyToTarget, cutPackageJson, generateDts, typecheck, publishToNpm} = buildUtils({
	defaultBuildOptions: {
		entryPoints: ["./src/main.ts"],
		bundle: true,
		platform: "node",
		packages: "external",
		format: "esm"
	}
})

let main = async (mode) => {
	await clear()
	switch(mode){
		case "typecheck": {
			await typecheck()
		} break

		case "build": {
			await build({minify: true})
			await copyToTarget("README.md", "LICENSE")
			await cutPackageJson()
			await generateDts()
		} break

		case "publish": {
			await main("typecheck")
			await main("test")
			await main("build")
			await publishToNpm({dryRun: true})
		} break
	}
}

main(Process.argv[2])