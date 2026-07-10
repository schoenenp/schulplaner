
type ExistingBook = {
    id: string;
    name: string;
    description: string;
    modules: {id: string;}[];
    bookTitle: string;
    subTitle: string;
    format: string;
    region: string;
    planStart: Date;
    planEnd: Date;
    createdById: string;
}

export function copyBook(existingBook:ExistingBook){
    return {
        id: existingBook.id,
        name: `${existingBook.name} - ORDERED`,
        bookTitle: existingBook.bookTitle,
        subTitle: existingBook.subTitle,
        format: existingBook.format,
        region: existingBook.region,
        planStart: existingBook.planStart,
        planEnd: existingBook.planEnd,
        modules: existingBook.modules.map(module => ({ id: module.id })),
        createdById: existingBook.createdById,
    }   
}