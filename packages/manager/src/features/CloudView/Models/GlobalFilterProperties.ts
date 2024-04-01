import { TimeDuration, TimeGranularity } from "@linode/api-v4";
import { WithStartAndEnd } from "src/features/Longview/request.types";

export interface GlobalFilterProperties {

    handleAnyFilterChange(filters:GlobalFiltersObject) : void|undefined;

}


export interface GlobalFiltersObject {
    region:string;
    serviceType:string;
    resource:string[];
    interval:string;
    timeRange:WithStartAndEnd;
    step:TimeGranularity;
    duration:TimeDuration;    
}