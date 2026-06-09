from pydantic import BaseModel


class FileRequest(BaseModel):
    project_name: str
    filename: str
    content: str