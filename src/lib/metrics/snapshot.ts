import { cache } from "react";
import { getDb } from "@/lib/db/client";
import { getNetworkSnapshot } from "./queries";

export const loadNetworkSnapshot = cache(() => getNetworkSnapshot(getDb()));
