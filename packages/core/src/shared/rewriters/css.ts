import { URLMeta, rewriteUrl, unrewriteUrl } from "@rewriters/url";
import { ScramjetContext } from "@/shared";
import { String } from "@/shared/snapshot";

export function rewriteCss(
	css: string,
	context: ScramjetContext,
	meta: URLMeta
) {
	return handleCss("rewrite", css, context, meta);
}

export function unrewriteCss(css: string, context: ScramjetContext) {
	return handleCss("unrewrite", css, context);
}

function handleCss(
	type: "rewrite" | "unrewrite",
	css: string,
	context: ScramjetContext,
	meta?: URLMeta
) {
	// regex from vk6 (https://github.com/ading2210)
	const urlRegex =
		/(?i:url)\((?:\s*"((?:\\.|[^"])+)"\s*|\s*'((?:\\.|[^'])+)'\s*|((?!\s*['"])(?!\s*\))(?:\\.|[^)])+?))\)/gm;
	const Atruleregex =
		/@import\s+((?i:url)\s*?\(.{0,9999}?\)|['"].{0,9999}?['"]|.{0,9999}?)($|\s|;)/gm;
	// A CSS comment is not executable CSS.  Rewrite only segments outside
	// comments; rewriting URLs inside comments can corrupt source text.
	// The scanner also tracks quoted strings, so literal /* inside a quoted
	// URL is not mistaken for the start of a comment.
	css = String(css);
	function rewriteSegment(segment: string) {
		segment = segment.replace(
			urlRegex,
			(
				match,
				doubleQuotedUrl: string | undefined,
				singleQuotedUrl: string | undefined,
				unquotedUrl: string | undefined
			) => {
				const url = doubleQuotedUrl ?? singleQuotedUrl ?? unquotedUrl;
				const encodedUrl =
					type === "rewrite"
						? rewriteUrl(url.trim(), context, meta!)
						: unrewriteUrl(url.trim(), context);

				return match.replace(url, encodedUrl);
			}
		);
		segment = segment.replace(Atruleregex, (match, importStatement: string) => {
			return match.replace(
				importStatement,
				importStatement.replace(
					/^(url\(['"]?|['"]|)(.+?)(['"]|['"]?\)|)$/gm,
					(match: string, firstQuote: string, url: string, endQuote: string) => {
						if (firstQuote.startsWith("url")) {
							return match;
						}
						const encodedUrl =
							type === "rewrite"
								? rewriteUrl(url.trim(), context, meta!)
								: unrewriteUrl(url.trim(), context);

						return `${firstQuote}${encodedUrl}${endQuote}`;
					}
				)
			);
		});
		return segment;
	}

	let result = "";
	let start = 0;
	let index = 0;
	let quote: '"' | "'" | null = null;
	while (index < css.length) {
		const char = css[index];
		if (quote !== null) {
			if (char === "\\") {
				index += 2;
				continue;
			}
			if (char === quote) quote = null;
			index++;
			continue;
		}
		if (char === '\"' || char === "'") {
			quote = char;
			index++;
			continue;
		}
		if (char === "/" && css[index + 1] === "*") {
			result += rewriteSegment(css.slice(start, index));
			const commentStart = index;
			const end = css.indexOf("*/", index + 2);
			index = end === -1 ? css.length : end + 2;
			result += css.slice(commentStart, index);
			start = index;
			continue;
		}
		index++;
	}
	return result + rewriteSegment(css.slice(start));
}
