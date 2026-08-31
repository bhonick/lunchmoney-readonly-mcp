import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
    api,
    dataResponse,
    handleApiError,
    catchError,
} from "../api.js";

export function registerCategorizationTools(server: McpServer): void {
    server.registerTool(
        "categorize_transaction",
        {
            description:
                "Change only the category of one existing transaction. This tool cannot change amount, date, payee, notes, tags, account, status, recurring linkage, metadata, splits, groups, attachments, or any other transaction field.",
            inputSchema: z.object({
                transaction_id: z.coerce
                    .number()
                    .int()
                    .positive()
                    .describe("ID of the transaction to categorize."),
                category_id: z
                    .union([z.coerce.number().int().positive(), z.null()])
                    .describe(
                        "Leaf category ID to assign, or null to remove the transaction's category.",
                    ),
            }),
            annotations: {
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
        },
        async ({ transaction_id, category_id }) => {
            try {
                const response = await api.put(
                    `/transactions/${transaction_id}`,
                    { category_id },
                );

                if (!response.ok) {
                    return handleApiError(
                        response,
                        "Failed to categorize transaction",
                    );
                }

                return dataResponse(await response.json());
            } catch (error) {
                return catchError(error, "Failed to categorize transaction");
            }
        },
    );
}
