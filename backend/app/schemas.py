from pydantic import BaseModel


class FileRequest(BaseModel):
    project_name: str
    filename: str
    content: str


class CreateFileRequest(BaseModel):
    path: str
    content: str = ""


class CreateFolderRequest(BaseModel):
    path: str


class RenamePathRequest(BaseModel):
    path: str
    new_path: str