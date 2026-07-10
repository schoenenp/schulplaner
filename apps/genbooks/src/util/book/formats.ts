import type { Dimensions } from "./sra3-fit";

export type BookFormat = {
    name: string;
    type: string;
    dimensions: Dimensions
}
export const BOOK_FORMATS:BookFormat[] = [

{
    name:"A4",
    type:"DIN",
    dimensions:{
        x: 210,
        y: 297
    },
},
{
    name:"A5",
    type:"DIN",
    dimensions:{
        x: 148,
        y: 210
    },
},
{
    name:"A6",
    type:"DIN",
    dimensions:{
        x: 74,
        y: 148
    },
},
]